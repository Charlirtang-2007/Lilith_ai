"""Zero-dependency mock backend for UI work.

Implements the same WebSocket protocol as `backend/main.py` and a couple of
HTTP helpers (`/ping`, `/api/dev/emit`) so the frontend can be developed and
screenshotted without an LLM key or the Python dependency stack.

    python tools/dev-mock/server.py
    VITE_BACKEND_HTTP=http://127.0.0.1:8765 npm run dev
"""
import asyncio
import base64
import hashlib
import json
import random
import urllib.parse

REPLIES = [
    ("嘿嘿，今天也要好好休息呀。", "smile"),
    ("你怎么突然想起我了？", "surprise"),
    ("哼，我一直都在的哦。", "angry"),
    ("……嗯，有点困了。", "sleepy"),
    ("我一直都记得你，才不会忘呢。", "calm"),
    ("被你这样看着，会不好意思的。", "embarrassed"),
    ("要是累了就靠一会儿吧，我陪着你。", "wronged"),
]

CLIENTS: dict[asyncio.StreamWriter, asyncio.Lock] = {}
WRITE_LOCK = asyncio.Lock()


def frame(obj: dict) -> bytes:
    data = json.dumps(obj, ensure_ascii=False).encode()
    header = bytearray([0x81])
    n = len(data)
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header += n.to_bytes(2, "big")
    else:
        header.append(127)
        header += n.to_bytes(8, "big")
    return bytes(header) + data


async def send_obj(writer: asyncio.StreamWriter, obj: dict) -> None:
    async with WRITE_LOCK:
        writer.write(frame(obj))
        await writer.drain()


async def broadcast(obj: dict) -> int:
    sent = 0
    for writer in list(CLIENTS):
        try:
            await send_obj(writer, obj)
            sent += 1
        except Exception:
            CLIENTS.pop(writer, None)
    return sent


def http_response(status: str, body: bytes = b"", content_type: str = "application/json") -> bytes:
    headers = [
        f"HTTP/1.1 {status}",
        f"Content-Type: {content_type}",
        f"Content-Length: {len(body)}",
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Methods: GET, OPTIONS",
        "Access-Control-Allow-Headers: *",
        "Connection: close",
    ]
    return ("\r\n".join(headers) + "\r\n\r\n").encode() + body


async def handle_http(method: str, path: str, query: dict, writer: asyncio.StreamWriter) -> None:
    if method == "OPTIONS":
        writer.write(http_response("204 No Content"))
        await writer.drain()
        writer.close()
        return

    if path == "/ping":
        writer.write(http_response("200 OK", b'{"pong": true}'))
    elif path == "/":
        writer.write(http_response("200 OK", b'{"status": "mock"}'))
    elif path == "/api/dev/emit":
        text = query.get("text", ["联调测试消息"])[0]
        emotion = query.get("emotion", ["smile"])[0]
        await broadcast({"type": "state_update", "payload": {"state": "thinking"}})
        await asyncio.sleep(0.35)
        sent = await broadcast(
            {
                "type": "audio_chunk",
                "payload": {"text": text, "audio_url": "", "expression": emotion},
            }
        )
        await broadcast({"type": "state_update", "payload": {"state": "idle"}})
        writer.write(http_response("200 OK", json.dumps({"sent": sent}).encode()))
    else:
        writer.write(http_response("404 Not Found", b'{"error": "not found"}'))
    await writer.drain()
    writer.close()


async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        request = await reader.readuntil(b"\r\n\r\n")
    except Exception:
        writer.close()
        return

    lines = request.split(b"\r\n")
    try:
        method, raw_path, _ = lines[0].decode("latin-1").split(" ", 2)
    except ValueError:
        writer.close()
        return
    parsed = urllib.parse.urlparse(raw_path)
    path = parsed.path
    query = urllib.parse.parse_qs(parsed.query)

    key = b""
    for line in lines:
        if line.lower().startswith(b"sec-websocket-key:"):
            key = line.split(b":", 1)[1].strip()

    if not key:
        await handle_http(method, path, query, writer)
        return

    accept = base64.b64encode(
        hashlib.sha1(key + b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest()
    ).decode()
    writer.write(
        (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        ).encode()
    )
    await writer.drain()
    CLIENTS[writer] = asyncio.Lock()
    print(f"桌宠窗口已连接（{len(CLIENTS)}）", flush=True)

    try:
        while True:
            head = await reader.readexactly(2)
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            if length == 126:
                length = int.from_bytes(await reader.readexactly(2), "big")
            elif length == 127:
                length = int.from_bytes(await reader.readexactly(8), "big")
            mask = await reader.readexactly(4) if head[1] & 0x80 else b""
            payload = await reader.readexactly(length) if length else b""
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x8:
                break
            if opcode == 0x1:
                try:
                    packet = json.loads(payload or b"{}")
                except json.JSONDecodeError:
                    continue
                if packet.get("type") == "text_input":
                    text, emotion = random.choice(REPLIES)
                    await send_obj(writer, {"type": "state_update", "payload": {"state": "thinking"}})
                    await asyncio.sleep(0.6)
                    await send_obj(
                        writer,
                        {
                            "type": "audio_chunk",
                            "payload": {"text": text, "audio_url": "", "expression": emotion},
                        },
                    )
                    await send_obj(writer, {"type": "state_update", "payload": {"state": "idle"}})
                elif packet.get("type") == "set_dnd_mode":
                    print("勿扰模式:", packet.get("payload"), flush=True)
                elif packet.get("type") == "audio_input":
                    await send_obj(
                        writer,
                        {"type": "text_input", "payload": {"text": "（语音识别示例）"}},
                    )
                    await send_obj(writer, {"type": "state_update", "payload": {"state": "thinking"}})
                    await asyncio.sleep(0.6)
                    await send_obj(
                        writer,
                        {
                            "type": "audio_chunk",
                            "payload": {
                                "text": "我听到你的声音了。",
                                "audio_url": "",
                                "expression": "smile",
                            },
                        },
                    )
                    await send_obj(writer, {"type": "state_update", "payload": {"state": "idle"}})
    except Exception as exc:
        print("连接结束:", exc, flush=True)
    finally:
        CLIENTS.pop(writer, None)
        writer.close()


async def main() -> None:
    server = await asyncio.start_server(handle, "127.0.0.1", 8765)
    print(
        "Mock 后端: ws://127.0.0.1:8765/ws · http://127.0.0.1:8765/ping\n"
        "推送示例: curl \"http://127.0.0.1:8765/api/dev/emit?text=你好&emotion=smile\"",
        flush=True,
    )
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
