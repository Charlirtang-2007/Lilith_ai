"""后台自主循环：闹钟检查 + 无聊检测（主动发言）。"""
import asyncio
import time
from datetime import datetime

from config import Config
from services import AIService


async def send_alarm_reply(alarm: dict, send_func, tts_enabled: bool) -> None:
    """用 TTS 播报闹钟；TTS 关闭或失败时只发文字。"""
    audio_url = ""
    if tts_enabled:
        try:
            audio_url = await AIService.text_to_speech(alarm["message"])
        except Exception as e:
            print(f"❌ 闹钟语音生成失败: {e}")
    await send_func(
        "audio_chunk",
        {
            "text": alarm["message"],
            "audio_url": audio_url or "",
            "expression": "surprise",
            "is_alarm": True,
        },
    )


async def game_loop(brain, send_func, on_proactive):
    """每秒 tick 一次：
    - 每 ALARM_CHECK_INTERVAL 秒检查闹钟；
    - 用户静默超过动态阈值且非勿扰/非思考中时，触发一次主动发言。
    """
    print("🔄 自主意识启动，闹钟检查间隔:", Config.ALARM_CHECK_INTERVAL, "秒")
    last_alarm_check = time.time()
    tick = 0

    while True:
        tick += 1
        now = time.time()

        if tick % 60 == 0:
            print(
                f"⏳ 心跳 #{tick} at {datetime.now():%H:%M:%S}，闹钟数量: {len(brain.alarms.items)}"
            )

        # ===== 闹钟 =====
        if Config.ALARM_ENABLED and now - last_alarm_check >= Config.ALARM_CHECK_INTERVAL:
            last_alarm_check = now
            triggered = brain.alarms.check(datetime.now())
            if triggered:
                print(f"⏰ 触发 {len(triggered)} 个闹钟")
                await asyncio.gather(*(send_alarm_reply(a, send_func, brain.tts_enabled) for a in triggered))

        # ===== 无聊检测 =====
        idle_for = now - brain.last_user_input_time
        if (
            not brain.is_dnd_mode
            and brain.state == "idle"
            and idle_for > brain.current_threshold
        ):
            print(f"💭 用户静默 {idle_for:.0f}s，触发主动发言")
            await on_proactive()
            brain.increase_boredom_time()

        await asyncio.sleep(1)
