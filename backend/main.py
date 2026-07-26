import asyncio
import time
# 已经由 from datetime import datetime, timedelta 替代
from datetime import datetime, timedelta   # 确保有 timedelta
from pathlib import Path                # ← 新增（用于持久化）
import random
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from services import AIService
from memory import MemorySystem
from tools import ToolBox
import re
import json
from string import Template
from config import Config
import os
import uuid
from fastapi.staticfiles import StaticFiles


def clean_and_parse_json(raw: str) -> dict:
    if not isinstance(raw, str):
        raise TypeError(f"Expected str, got {type(raw).__name__}")

    raw = raw.strip()

    # 1. 去掉 Markdown 代码块
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()

    # 2. 去掉可能的时间戳前缀
    raw = re.sub(r'^[\[\(]?\d{2}:\d{2}:\d{2}[\]\)]?\s*', '', raw)

    # 3. 寻找第一个 JSON 起始位置
    json_start = re.search(r'[\{\[]', raw)
    if json_start:
        raw = raw[json_start.start():]

    # 4. 尝试直接解析（修复：移除 strict=False）
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # 5. 尝试提取最外层 JSON 对象
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # 6. 尝试提取 JSON 数组
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # 7. 尝试替换单引号
    try:
        fixed = raw.replace("'", '"')
        return json.loads(fixed)
    except:
        pass

    # 8. 最终兜底
    print(f"⚠️ JSON 解析最终失败，将纯文本作为回复。原始内容: {raw[:100]}...")
    return {
        "thought": "解析失败",
        "reply": raw.strip() if raw.strip() else "唔…我好像卡了一下，能再说一遍吗？",
        "emotion": "neutral",
        "memory_operation": {}
    }


ALLOWED_EMOTIONS = {
    "angry", "embarrassed", "calm", "daze", "fear", "blink",
    "sad", "sleepy", "smile", "surprise", "wronged",
    "lie_down", "stand", "sleep", "show", "sit", "birthday",
    "neutral"
}


def sanitize_emotion(emotion: str) -> str:
    if emotion in ALLOWED_EMOTIONS:
        return emotion
    print(f"⚠️ 非法情绪标签 '{emotion}'，强制改为 'neutral'")
    return "neutral"


# 导入角色提示词
with open("Lilith_tsc.txt", "r", encoding='utf-8') as f:
    Lilith_tsc_ = f.read()

app = FastAPI()

# 如果不存在临时音频目录，则创建
if not os.path.exists("temp_audios"):
    os.makedirs("temp_audios")

# 挂载静态文件路由，外界可以通过 /static/xxx.wav 访问到 temp_audios 目录下的文件
app.mount("/static", StaticFiles(directory="temp_audios"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "message": "莉莉丝的后端已启动"}


@app.get("/ping")
async def ping():
    return {"pong": True}


class NeuroBrain:
    def __init__(self):
        self.state = "idle"
        self.last_interaction = time.time()
        self.last_user_input_time = time.time()
        self.last_auto_speech_time = time.time()          # 首次主动发言将在启动后 boredom_threshold 秒发生
        self.boredom_threshold = 1500                      # ★ 初始阈值设为 10 分钟 ——600
        self.is_dnd_mode = False
        self.current_threshold = self.boredom_threshold   # 初始无聊阈值
        self.max_threshold = 3600                         # 最大 1 小时
        self.memory = MemorySystem()
        self.history = []
        self.current_emotion = "neutral"
        self.alarms = []  # 存放闹钟列表
        self._load_alarms()  # 启动时加载持久化闹钟

    def update_activity(self):
        self.last_interaction = time.time()

    # -------------------- 闹钟管理 --------------------
    def add_alarm(self, trigger_dt: datetime, message: str, repeat: str = 'once'):
        """
        添加一个新闹钟
        :param trigger_dt: datetime对象，触发时间
        :param message: 提醒内容
        :param repeat: 重复方式，'once' / 'daily' / 'weekly'
        """
        if not isinstance(trigger_dt, datetime):
            raise ValueError("trigger_dt 必须是 datetime 对象")
        self.alarms.append({
            'trigger_time': trigger_dt,
            'message': message or Config.ALARM_DEFAULT_MESSAGE,
            'repeat': repeat,
            'created_at': datetime.now()
        })
        self._save_alarms()   # 立即持久化
        print(f"⏰ 闹钟已添加：{trigger_dt.strftime('%Y-%m-%d %H:%M')} - {message}")

    def check_alarms(self, current_dt: datetime):
        """
        检查并触发到期的闹钟，返回触发列表
        :param current_dt: 当前时间
        :return: 已触发的闹钟列表（每个元素是字典）
        """
        triggered = []
        remaining = []
        for alarm in self.alarms:
            if alarm['trigger_time'] <= current_dt:
                triggered.append(alarm)
                # 处理重复
                if alarm['repeat'] == 'daily':
                    new_time = alarm['trigger_time'] + timedelta(days=1)
                    alarm['trigger_time'] = new_time
                    remaining.append(alarm)
                elif alarm['repeat'] == 'weekly':
                    new_time = alarm['trigger_time'] + timedelta(weeks=1)
                    alarm['trigger_time'] = new_time
                    remaining.append(alarm)
                # 'once' 不保留，丢弃
            else:
                remaining.append(alarm)
        self.alarms = remaining
        if triggered:                     # 有触发才保存
            self._save_alarms()
        return triggered

    def _save_alarms(self):
        """将闹钟列表持久化到 JSON 文件"""
        data = []
        for alarm in self.alarms:
            data.append({
                "trigger_time": alarm["trigger_time"].isoformat(),
                "message": alarm["message"],
                "repeat": alarm["repeat"]
            })
        try:
            with open("alarms_backup.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️ 保存闹钟失败: {e}")

    def _load_alarms(self):
        """从 JSON 文件恢复闹钟（服务启动时调用）"""
        if not Path("alarms_backup.json").exists():
            return
        try:
            with open("alarms_backup.json", "r", encoding="utf-8") as f:
                data = json.load(f)
            for item in data:
                dt = datetime.fromisoformat(item["trigger_time"])
                self.alarms.append({
                    "trigger_time": dt,
                    "message": item["message"],
                    "repeat": item["repeat"]
                })
            print(f"⏰ 已从备份恢复 {len(self.alarms)} 个闹钟")
        except Exception as e:
            print(f"⚠️ 加载闹钟失败: {e}")

    def reset_boredom_time(self):
        self.last_user_input_time = time.time()
        self.current_threshold = self.boredom_threshold
        self.update_activity()

    def increase_boredom_time(self):
        """每次主动发言后增加下次主动间隔"""
        self.current_threshold = min(self.current_threshold * 2, self.max_threshold)
        print(f"下次主动对话将在 {self.current_threshold}s 后进行")

    async def build_system_prompt(self, user_input: str = None):
        now_str = datetime.now().strftime("%Y年%m月%d日 %H:%M")
        known_facts = self.memory.get_fact_context()
        longmemory = await self.memory.get_longmemory_context(user_input)

        template = Template("""
    $lilith_tsc
    当前时间：$now。

    【已知用户事实】
    $known_facts
2sRWDbcFPUjr
    【长期记忆】
    $longmemory

    【输出要求】
    你必须且只能返回一个纯净的 JSON 对象，不包含任何额外内容。
    - 禁止在 JSON 外添加时间戳、开场白、解释或任何自然语言。
    - 禁止使用 Markdown 代码块。
    - 你的整个回复必须能被 Python 的 json.loads() 直接解析。

    【情绪标签限制】
    你返回的 "emotion" 字段必须且只能从以下列表中选择一个：
    ["angry", "embarrassed", "calm", "daze", "fear", "blink", "sad", "sleepy", "smile", "surprise", "wronged",
    "lie_down", "stand", "sleep", "show", "sit", "birthday", "neutral"]
    如果无法判断，请返回 "neutral"。

    【格式示例】
    {"thought": "内心独白", "reply": "回复内容", "emotion": "happy", "memory_operation": null}

    【memory_operation 字段说明】
    {
        "new_facts": { "key": "value" } 或 null,
        "new_episode": "对话事件的简要摘要（≤50字）" 或 null,
        "is_silence_requested": true/false
        "alarm": {                               // ← 新增闹钟字段（可选）
            "action": "add",                     // 目前仅支持 "add"
            "time": "2026-07-27T09:00:00",      // ISO 8601 格式，如 "2026-07-27T09:00:00"
            "message": "提醒内容",                // 可选，默认使用配置值
            "repeat": "once"                    // 可选: once, daily, weekly
        }
    }
     如果用户明确要求设置提醒/闹钟，请在 memory_operation 中返回上述 alarm 对象。
     注意：必须将相对时间（如“明天上午9点”）转换为绝对的 ISO 时间字符串。

    【规则】
    1. 如果用户心情不好，优先安慰，而不是开玩笑。
    2. 如果用户问起你以前说过的话，尽量从记忆中提取。
    3. 不要编造用户没说过的事实。
    4. 如果用户说"我想静静"或类似的话，把 `is_silence_requested` 设为 true。

    【绝对禁止】
    - 禁止在 JSON 外加任何额外文字或时间戳。
    """)

        content = template.substitute(
            lilith_tsc=Lilith_tsc_,
            now=now_str,
            known_facts=known_facts,
            longmemory=longmemory,
        )

        return {"role": "system", "content": content}


brain = NeuroBrain()


@app.get("/api/current_emotion")
async def get_current_emotion():
    return {"animation": brain.current_emotion}


# === WebSocket 路由 ===
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("⚡ 连接建立")

    async def send_to_frontend(type_str, payload):
        try:
            await websocket.send_json({"type": type_str, "payload": payload})
        except:
            pass

    loop_task = asyncio.create_task(game_loop(websocket, send_to_frontend))

    try:
        while True:
            data = await websocket.receive_text()
            packet = json.loads(data)
            brain.update_activity()

            if packet["type"] == "text_input":
                text = packet["payload"]["text"]
                await handle_user_input(text, send_to_frontend)

            elif packet["type"] == "audio_input":
                audio_b64 = packet["payload"]["audio_base64"]
                text = await AIService.speech_to_text(audio_b64)
                if text:
                    await send_to_frontend("text_input", {"text": text})
                    await handle_user_input(text, send_to_frontend)

            elif packet["type"] == "interrupt":
                print("🛑 用户打断")
                brain.state = "idle"


    except WebSocketDisconnect:

        print("🔌 连接断开")

        loop_task.cancel()

        import shutil

        # WebSocket 断开连接时，清空临时音频文件（加上异常保护）

        try:

            if os.path.exists("temp_audios"):
                shutil.rmtree("temp_audios")

                os.makedirs("temp_audios")

        except Exception as e:

            print(f"⚠️ 清理临时音频目录时发生小冲突（不影响下次启动）: {e}")
    except Exception as e:
        print(f"❌ Main Loop Error: {e}")


# === 核心逻辑 ===

async def handle_user_input(text: str, send_func):
    brain.state = "thinking"
    await send_func("state_update", {"state": "thinking"})
    brain.reset_boredom_time()
    user_time_str = datetime.now().strftime("[%H:%M:%S]")
    current_image_b64 = None

    vision_keywords = ["看看", "截图", "什么样", "屏幕", "image", "photo"]
    if Config.ENABLE_VISION and any(k in text for k in vision_keywords):
        print("📸 检测到视觉关键词，正在截图...")
        current_image_b64 = ToolBox.capture_screen_base64()

    try:
        sys_prompt = await brain.build_system_prompt(text)
        current_msg_block = {
            "role": "user",
            "content": f"{user_time_str} {text}"
        }

        if current_image_b64:
            current_msg_block["content"] += "\n(系统附图：当前屏幕截图)"

        messages = [sys_prompt] + brain.history + [current_msg_block]

        print("🧠 主脑思考中...")
        raw_response = await AIService.chat_with_neuro_brain(messages, image_base64=current_image_b64)

        safe_raw = str(raw_response) if raw_response else ""
        print(f"📄 [用户对话] 原始AI返回:\n{safe_raw}\n{'-' * 50}")

        try:
            result_json = clean_and_parse_json(raw_response)
        except Exception as e:
            safe_raw = str(raw_response) if raw_response else ""
            print(f"❌ JSON解析失败，原始响应前200字符: {safe_raw[:200]}...")
            result_json = {
                "thought": "API返回格式异常，使用备用回复",
                "reply": "唔...我刚才走神了，能再说一遍吗？",
                "emotion": "neutral",
                "memory_operation": {}
            }

        reply = result_json.get("reply", "（发呆中...）")
        raw_emotion = result_json.get("emotion", "neutral")
        emotion = sanitize_emotion(raw_emotion)
        result_json["emotion"] = emotion
        mem_op = result_json.get("memory_operation", {})
        thought = result_json.get("thought", "无想法")

        print(f"💭 {thought}")

        if mem_op:
            await brain.memory.execute_updates(mem_op)
            if mem_op.get("is_silence_requested"):
                brain.is_dnd_mode = True
                print("🔕 进入勿扰模式")

        if brain.is_dnd_mode and not mem_op.get("is_silence_requested"):
            brain.is_dnd_mode = False

        # ----- 处理闹钟操作（新增） -----
        alarm_op = mem_op.get("alarm") if mem_op else None  # ✅ 修正位置
        if alarm_op and isinstance(alarm_op, dict):
            print(f"🔔 检测到闹钟操作: {alarm_op}")
            action = alarm_op.get("action")
            if action == "add":
                time_str = alarm_op.get("time")
                message = alarm_op.get("message", Config.ALARM_DEFAULT_MESSAGE)
                repeat = alarm_op.get("repeat", "once")
                if time_str:
                    try:
                        # 解析 ISO 格式时间（支持 Z 结尾）
                        if time_str.endswith('Z'):
                            trigger_dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                            trigger_dt = trigger_dt.replace(tzinfo=None)
                        else:
                            trigger_dt = datetime.fromisoformat(time_str)
                        brain.add_alarm(trigger_dt, message, repeat)
                        # 向前端发送确认消息
                        await send_func("system_message", {"text": f"⏰ 已设置闹钟：{message}"})
                    except ValueError as e:
                        print(f"⚠️ 闹钟时间格式错误：{time_str}，错误：{e}")
                        await send_func("system_message", {"text": "⚠️ 闹钟时间格式无法识别，请重新设置"})

        if current_image_b64:
            text += " [已发送截图]"
        ai_time_str = datetime.now().strftime("[%H:%M:%S]")
        brain.history.append({
            "role": "user",
            "content": f"{user_time_str} {text}"
        })

        if reply:
            brain.history.append({
                "role": "assistant",
                "content": f"{ai_time_str} {reply}"
            })

        brain.history = brain.history[-10:]

        await send_reply(reply, emotion, send_func)
        brain.last_auto_speech_time = time.time()

    except Exception as e:
        print(f"❌ Handle Error: {e}")
        await send_func("state_update", {"state": "idle"})
    finally:
        brain.state = "idle"
        brain.update_activity()


async def send_reply(text: str, emotion: str, send_func):
    brain.current_emotion = emotion
    try:
        brain.state = "speaking"
        # 调用 TTS，获得音频文件的静态路径（如 /static/xxxx.wav）
        audio_url = await AIService.text_to_speech(text, emotion)

        await send_func("audio_chunk", {
            "text": text,
            "audio_url": audio_url or "",      # ✅ 使用 audio_url 字段
            "expression": emotion
        })
    except Exception as e:
        print(f"⚠️ 回复发送失败（仅文字模式）: {e}")
        await send_func("audio_chunk", {
            "text": text,
            "audio_url": "",                   # ✅ 这里也改为 audio_url
            "expression": emotion
        })


async def game_loop(ws, send_func):
    print("🔄 自主意识启动，闹钟检查间隔:", Config.ALARM_CHECK_INTERVAL, "秒")

    # ========== 必须初始化的变量 ==========
    last_alarm_check = time.time()
    loop_counter = 0

    try:
        while True:
            loop_counter += 1
            now = time.time()
            current_dt = datetime.now()  # ✅ 修正：直接使用 datetime.now()

            # ----- 每5秒打印一次心跳 -----
            if loop_counter % 5 == 0:
                print(f"⏳ 循环心跳 #{loop_counter}  at {current_dt.strftime('%H:%M:%S')}，闹钟数量: {len(brain.alarms)}")

            # ==================== 闹钟检查 ====================
            if Config.ALARM_ENABLED:
                if now - last_alarm_check >= Config.ALARM_CHECK_INTERVAL:
                    print(f"⏰ 开始检查闹钟 (距上次检查 {now - last_alarm_check:.1f}s)")
                    triggered = brain.check_alarms(current_dt)
                    if triggered:
                        print(f"⏰ 触发了 {len(triggered)} 个闹钟！")

                        # 定义处理单个闹钟的异步函数（内部调用 TTS）
                        async def _handle_alarm_with_tts(alarm):
                            try:
                                print(f"⏰ 生成语音: {alarm['message']}")
                                audio_url = await AIService.text_to_speech(alarm['message'], "surprise")
                                if audio_url:
                                    print(f"✅ 语音生成成功: {audio_url}")
                                else:
                                    print("⚠️ TTS 返回空，将只发送文字")
                                await send_func("audio_chunk", {
                                    "text": alarm['message'],
                                    "audio_url": audio_url or "",  # 若TTS失败则为空，前端可降级显示文字
                                    "expression": "surprise",
                                    "is_alarm": True
                                })
                            except Exception as e:
                                print(f"❌ 闹钟播报失败: {e}")
                                # 即使TTS失败，也尝试发送纯文字提醒
                                await send_func("audio_chunk", {
                                    "text": alarm['message'],
                                    "audio_url": "",
                                    "expression": "surprise",
                                    "is_alarm": True
                                })

                        # 并发执行所有闹钟的播报
                        if triggered:
                            print(f"⏰ 触发了 {len(triggered)} 个闹钟，开始并发播报...")
                            tasks = [_handle_alarm_with_tts(alarm) for alarm in triggered]
                            await asyncio.gather(*tasks)
                            print("✅ 所有闹钟播报完毕")
                    else:
                        if brain.alarms:
                            next_time = min(a['trigger_time'] for a in brain.alarms)
                            print(f"⏰ 下次闹钟: {next_time.strftime('%H:%M:%S')}")
                    last_alarm_check = now
            else:
                if loop_counter % 10 == 0:
                    print("⚠️ 闹钟模块未启用 (ALARM_ENABLED=False)")

            # ==================== 原有主动发言逻辑 ====================
            if (not brain.is_dnd_mode) and \
                    (brain.state == "idle") and \
                    (now - brain.last_user_input_time > brain.current_threshold):

                print(f"🥱 触发主动发言（距上次用户输入 {now - brain.last_user_input_time:.0f}s）")
                brain.state = "thinking"
                await send_func("state_update", {"state": "thinking"})
                brain.update_activity()

                try:
                    sys_prompt = await brain.build_system_prompt()
                    last_active_str = datetime.fromtimestamp(brain.last_user_input_time).strftime("%H:%M:%S")  # ✅ 修正
                    trigger_content = f"""
                    （系统自动触发指令：
                    你必须在 `reply` 字段中直接输出莉莉丝的对话，整个响应必须是一个纯净的 JSON 对象。
                    严禁添加时间戳、开场白或任何自然语言解释。
                    用户当前处于静默状态，最后一次发言时间为：{last_active_str}。
                    请根据时间差和记忆信息主动发起自然对话。
                    必须返回纯 JSON。）
                    """

                    msgs = [sys_prompt] + brain.history + [{
                        "role": "user",
                        "content": trigger_content
                    }]

                    print("🧠 主脑主动思考中...")
                    raw_response = await AIService.chat_with_neuro_brain(msgs)

                    safe_raw = str(raw_response) if raw_response else ""
                    print(f"📄 [主动发言] 原始AI返回:\n{safe_raw}\n{'-' * 50}")

                    try:
                        result_json = clean_and_parse_json(raw_response)
                    except Exception as e:
                        safe_raw = str(raw_response) if raw_response else ""
                        print(f"❌ 主动发言JSON解析失败，原始响应: {safe_raw[:200]}...")
                        result_json = {
                            "reply": "嗯...我好像卡住了，要不你先说点什么？",
                            "emotion": "neutral"
                        }

                    reply = result_json.get("reply")
                    raw_emotion = result_json.get("emotion", "neutral")
                    emotion = sanitize_emotion(raw_emotion)

                    if reply:
                        print(f"💡 主动生成: {reply}")
                        ai_time_str = datetime.now().strftime("[%H:%M:%S]")  # ✅ 修正

                        brain.history.append({
                            "role": "user",
                            "content": trigger_content
                        })
                        brain.history.append({
                            "role": "assistant",
                            "content": f"{ai_time_str} {reply}"
                        })
                        brain.history = brain.history[-10:]

                        await send_reply(reply, emotion, send_func)
                        brain.last_auto_speech_time = now
                        brain.increase_boredom_time()

                        brain.state = "idle"
                        await send_func("state_update", {"state": "idle"})
                    else:
                        print("⚠️ 主动发言生成了空内容")
                        brain.state = "idle"
                        await send_func("state_update", {"state": "idle"})

                except Exception as e:
                    print(f"❌ 主动发言失败: {e}")
                    import traceback
                    traceback.print_exc()
                    brain.state = "idle"
                    await send_func("state_update", {"state": "idle"})

            await asyncio.sleep(1)

    except Exception as e:
        print(f"❌ game_loop 主循环崩溃: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
