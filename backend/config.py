import os
from pathlib import Path

from dotenv import load_dotenv

# 项目根目录与统一数据目录（所有运行时产物都落在这里，方便打包与清理）
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = Path(os.getenv("LILITH_DATA_DIR", PROJECT_ROOT / "data")).resolve()

load_dotenv(BACKEND_DIR / ".env")


class Config:
    # ===== LLM 主脑 =====
    LLM_API_KEY = os.getenv("LLM_API_KEY")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL")
    LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.0-flash-exp")
    ENABLE_VISION = os.getenv("ENABLE_VISION", "false").lower() == "true"

    # Profile / Intent（暂时废弃）
    PROFILE_KEY = os.getenv("PROFILE_LLM_KEY")
    PROFILE_BASE = os.getenv("PROFILE_LLM_BASE")

    # ===== SiliconFlow（STT / 云端 TTS）=====
    SILICON_KEY = os.getenv("SILICON_API_KEY")
    SILICON_BASE = os.getenv("SILICON_BASE_URL")
    STT_MODEL = os.getenv("STT_MODEL", "FunAudioLLM/SenseVoiceSmall")

    # ===== 本地嵌入模型（embedding 功能可降级）=====
    EMBEDDING_MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH", "")

    # ===== 本地 TTS 微服务 =====
    TTS_SERVICE_URL = os.getenv("TTS_SERVICE_URL", "http://127.0.0.1:9880")
    TTS_TIMEOUT = float(os.getenv("TTS_TIMEOUT", "60"))

    # ===== 角色卡 =====
    PERSONA_PATH = Path(
        os.getenv("PERSONA_PATH", BACKEND_DIR / "personas" / "pet.txt")
    ).resolve()
    PET_NAME = os.getenv("PET_NAME", "莉莉丝")

    # ===== 主动发言（无聊检测）=====
    BOREDOM_THRESHOLD = int(os.getenv("BOREDOM_THRESHOLD", "1500"))
    BOREDOM_MAX = int(os.getenv("BOREDOM_MAX", "3600"))

    # ===== 闹钟 =====
    ALARM_ENABLED = os.getenv("ALARM_ENABLED", "true").lower() == "true"
    ALARM_CHECK_INTERVAL = int(os.getenv("ALARM_CHECK_INTERVAL", "10"))
    ALARM_DEFAULT_MESSAGE = os.getenv("ALARM_DEFAULT_MESSAGE", "⏰ 闹钟时间到了！")

    # ===== 服务 =====
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "8000"))
    PROXY = os.getenv("PROXY_URL")


def data_dir() -> Path:
    """返回统一数据目录，不存在时自动创建。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def audio_dir() -> Path:
    """TTS 临时音频目录（通过 /static 对外提供）。"""
    path = data_dir() / "audio"
    path.mkdir(parents=True, exist_ok=True)
    return path
