"""桌面宠物后端：WebSocket 对话、情绪状态、闹钟与主动发言。"""
import asyncio
import json
import shutil
import time
from datetime import datetime
from string import Template

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from alarms import AlarmStore
from config import Config, audio_dir
from game_loop import game_loop
from memory import MemorySystem
from services import AIService
from tools import ToolBox

ALLOWED_EMOTIONS = {
    "angry", "embarrassed", "calm", "daze", "fear", "blink",
    "sad", "sleepy", "smile", "surprise", "wronged",
    "lie_down", "stand", "sleep", "show", "sit", "birthday",
    "neutral",
}

VISION_KEYWORDS = ["看看", "截图", "什么样", "屏幕", "image", "photo"]

PROMPT_TEMPLATE = Template("""
    $persona
    当前时间：$now。

    【已知用户事实】
    $known_facts

    【长期记忆】
    $longmemory

    【输出要求】
    你必须且只能返回一个纯净的 JSON 对象，不包含任何额外内容。
    - 禁止在 JSON 外添加时间戳、开场白、解释或任何自然语言。
    - 禁止使用 Markdown 代码块。
    - 你的整个回复必须能被 Python 的 json.loads() 直接解析。

    【情绪标签限制】
    你返回的 "emotion" 字段必须且只能从以下列表中选择一个：
    $emotions
    如果无法判断，请返回 "neutral"。

    【格式示例】
    {"thought": "内心独白", "reply": "回复内容", "emotion": "smile", "memory_operation": null}

    【memory_operation 字段说明】
    {
        "new_facts": { "key": "value" } 或 null,
        "new_episode": "对话事件的简要摘要（≤50字）" 或 null,
        "is_silence_requested": true/false,
        "alarm": {
            "action": "add",
            "time": "2026-07-27T09:00:00",
            "message": "提醒内容",
            "repeat": "once"
        }
    }
     如果用户明确要求设置提醒/闹钟，请在 memory_operation 中返回上述 alarm 对象。
     注意：必须将相对时间（如“明天上午9点”）转换为绝对的 ISO 时间字符串。
     repeat 可选：once / daily / weekly。

    【规则】
    1. 如果用户心情不好，优先安慰，而不是开玩笑。
    2. 如果用户问起你以前说过的话，尽量从记忆中提取。
    3. 不要编造用户没说过的事实。
    4. 如果用户说"我想静静"或类似的话，把 `is_silence_requested` 设为 true。
""")


def clean_and_parse_json(raw: str) -> dict:
    if not isinstance(raw, str):
        raise TypeError(f"Expected str, got {type(raw).__name__}")
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def sanitize_emotion(emotion: str) -> str:
    if emotion in ALLOWED_EMOTIONS:
        return emotion
    print(f"⚠️ 非法情绪标签 '{emotion}'，强制改为 'neutral'")
    return "neutral"


def load_persona() -> str:
    text = Config.PERSONA_PATH.read_text(encoding="utf-8")
    # 去掉以 # 开头的注释行，再注入角色名
    lines = [line for line in text.splitlines() if not line.lstrip().startswith("#")]
    return "\n".join(lines).replace("{{PET_NAME}}", Config.PET_NAME)


class PetBrain:
    def __init__(self):
        self.state = "idle"
        self.last_interaction = time.time()
        self.last_user_input_time = time.time()
        self.last_auto_speech_time = time.time()
        self.boredom_threshold = Config.BOREDOM_THRESHOLD
        self.current_threshold = self.boredom_threshold
        self.max_threshold = Config.BOREDOM_MAX
        self.is_dnd_mode = False
        self.memory = MemorySystem()
        self.history: list[dict] = []
        self.current_emotion = "neutral"
        self.alarms = AlarmStore()
        self.persona = load_persona()

    # ---------- 时间 ----------
    def update_activity(self):
        self.last_interaction = time.time()

    def reset_boredom_time(self):
        self.last_user_input_time = time.time()
        self.current_threshold = self.boredom_threshold
        self.update_activity()

    def increase_boredom_time(self):
        self.current_threshold = min(self.current_threshold * 2, self.max_threshold)

    # ---------- 提示词 ----------
    async def build_system_prompt(self, user_input: str = None) -> dict:
        content = PROMPT_TEMPLATE.substitute(
            persona=self.persona,
            now=datetime.now().strftime("%Y年%m月%d日 %H:%M"),
            known_facts=self.memory.get_fact_context(),
            longmemory=await self.memory.get_longmemory_context(user_input),
            emotions=json.dumps(sorted(ALLOWED_EMOTIONS), ensure_ascii=False),
        )
        return {"role": "system", "content": content}

    def trim_history(self):
        self.history = self.history[-10:]

    # ---------- 记忆操作 ----------
    async def apply_memory_operation(self, mem_op: dict, send_func) -> None:
        if not mem_op:
            return
        await self.memory.execute_updates(mem_op)

        if mem_op.get("is_silence_requested"):
            self.is_dnd_mode = True
            print("🔕 进入勿扰模式")
        elif self.is_dnd_mode:
            self.is_dnd_mode = False

        alarm_op = mem_op.get("alarm")
        if isinstance(alarm_op, dict) and alarm_op.get("action") == "add":
            time_str = alarm_op.get("time")
            try:
                trigger_dt = datetime.fromisoformat(str(time_str).replace("Z", "+00:00"))
                self.alarms.add(
                    trigger_dt.replace(tzinfo=None),
                    alarm_op.get("message", Config.ALARM_DEFAULT_MESSAGE),
                    alarm_op.get("repeat", "once"),
                )
                await send_func(
                    "system_message",
                    {"text": f"⏰ 已设置闹钟：{alarm_op.get('message', Config.ALARM_DEFAULT_MESSAGE)}"},
                )
            except (TypeError, ValueError) as e:
                print(f"⚠️ 闹钟时间格式错误：{time_str}，错误：{e}")
                await send_func("system_message", {"text": "⚠️ 闹钟时间格式无法识别，请重新设置"})


brain = PetBrain()

app = FastAPI()
app.mount("/static", StaticFiles(directory=str(audio_dir())), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "pet": Config.PET_NAME}


@app.get("/ping")
async def ping():
    return {"pong": True}


@app.get("/api/current_emotion")
async def get_current_emotion():
    return {"animation": brain.current_emotion}


# ==================== WebSocket ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("⚡ 连接建立")

    async def send(type_str, payload):
        try:
            await websocket.send_json({"type": type_str, "payload": payload})
        except Exception:
            pass

    async def on_proactive():
        await proactive_speak(send)

    loop_task = asyncio.create_task(game_loop(brain, send, on_proactive))

    try:
        while True:
            packet = json.loads(await websocket.receive_text())
            brain.update_activity()
            ptype = packet.get("type")
            payload = packet.get("payload") or {}

            if ptype == "text_input":
                await handle_user_input(payload.get("text", ""), send)
            elif ptype == "audio_input":
                text = await AIService.speech_to_text(payload.get("audio_base64", ""))
                if text:
                    await send("text_input", {"text": text})
                    await handle_user_input(text, send)
            elif ptype == "set_dnd_mode":
                brain.is_dnd_mode = bool(payload.get("enabled"))
                print(f"🔕 勿扰模式: {brain.is_dnd_mode}")
            elif ptype == "interrupt":
                print("🛑 用户打断")
                brain.state = "idle"

    except WebSocketDisconnect:
        print("🔌 连接断开")
    except Exception as e:
        print(f"❌ Main Loop Error: {e}")
    finally:
        loop_task.cancel()
        # 清理本次会话的临时音频
        try:
            shutil.rmtree(audio_dir(), ignore_errors=True)
            audio_dir()
        except Exception as e:
            print(f"⚠️ 清理临时音频目录失败（不影响下次启动）: {e}")


async def send_reply(text: str, emotion: str, send_func):
    brain.current_emotion = emotion
    brain.state = "speaking"
    try:
        audio_url = await AIService.text_to_speech(text)
    except Exception as e:
        print(f"⚠️ TTS 失败，仅文字回复: {e}")
        audio_url = ""
    await send_func(
        "audio_chunk",
        {"text": text, "audio_url": audio_url or "", "expression": emotion},
    )


async def handle_user_input(text: str, send_func):
    brain.state = "thinking"
    await send_func("state_update", {"state": "thinking"})
    brain.reset_boredom_time()
    user_time_str = datetime.now().strftime("[%H:%M:%S]")
    image_b64 = None

    if Config.ENABLE_VISION and any(k in text for k in VISION_KEYWORDS):
        print("📸 检测到视觉关键词，正在截图...")
        image_b64 = ToolBox.capture_screen_base64()

    try:
        current_msg = {"role": "user", "content": f"{user_time_str} {text}"}
        if image_b64:
            current_msg["content"] += "\n(系统附图：当前屏幕截图)"

        messages = [await brain.build_system_prompt(text)] + brain.history + [current_msg]
        raw = await AIService.chat(messages, image_base64=image_b64)
        print(f"📄 主脑返回:\n{raw}\n{'-' * 50}")

        try:
            result = clean_and_parse_json(raw)
        except Exception:
            result = {
                "reply": "唔...我刚才走神了，能再说一遍吗？",
                "emotion": "neutral",
                "memory_operation": {},
            }

        reply = result.get("reply", "（发呆中...）")
        emotion = sanitize_emotion(result.get("emotion", "neutral"))
        print(f"💭 {result.get('thought', '')}")

        await brain.apply_memory_operation(result.get("memory_operation") or {}, send_func)

        brain.history.append({"role": "user", "content": current_msg["content"]})
        if reply:
            ai_time_str = datetime.now().strftime("[%H:%M:%S]")
            brain.history.append({"role": "assistant", "content": f"{ai_time_str} {reply}"})
        brain.trim_history()

        await send_reply(reply, emotion, send_func)
        brain.last_auto_speech_time = time.time()

    except Exception as e:
        print(f"❌ Handle Error: {e}")
    finally:
        brain.state = "idle"
        await send_func("state_update", {"state": "idle"})
        brain.update_activity()


async def proactive_speak(send_func):
    """无聊触发：AI 主动发起一次对话。"""
    brain.state = "thinking"
    last_active = datetime.fromtimestamp(brain.last_user_input_time).strftime("%H:%M:%S")
    trigger = (
        "（系统自动触发指令：用户当前处于静默状态，最后一次发言时间为 "
        f"{last_active}。请主动发起一段自然对话，只返回纯 JSON。）"
    )
    try:
        messages = [await brain.build_system_prompt()] + brain.history + [
            {"role": "user", "content": trigger}
        ]
        result = clean_and_parse_json(await AIService.chat(messages))
        reply = result.get("reply")
        if not reply:
            return
        emotion = sanitize_emotion(result.get("emotion", "neutral"))
        ai_time_str = datetime.now().strftime("[%H:%M:%S]")
        brain.history += [
            {"role": "user", "content": trigger},
            {"role": "assistant", "content": f"{ai_time_str} {reply}"},
        ]
        brain.trim_history()
        await send_reply(reply, emotion, send_func)
        brain.last_auto_speech_time = time.time()
    except Exception as e:
        print(f"❌ 主动发言失败: {e}")
    finally:
        brain.state = "idle"
        await send_func("state_update", {"state": "idle"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=Config.HOST, port=Config.PORT)
