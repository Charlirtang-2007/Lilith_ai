import asyncio
import base64
import io
import json
import uuid
from pathlib import Path

import requests
from openai import AsyncOpenAI

from config import Config, audio_dir

_embed_model = None
_embed_checked = False


def _get_embed_model():
    """懒加载本地 embedding 模型；未配置或缺失时返回 None（记忆功能自动降级）。"""
    global _embed_model, _embed_checked
    if _embed_checked:
        return _embed_model
    _embed_checked = True

    model_path = Config.EMBEDDING_MODEL_PATH or str(
        Path(__file__).resolve().parent / "models" / "sentence-embedding"
    )
    if not Path(model_path).exists():
        print(f"⚠️ 未找到 embedding 模型: {model_path}，长期记忆检索将不可用")
        return None
    try:
        from sentence_transformers import SentenceTransformer

        print(f"✅ 加载本地 embedding 模型: {model_path}")
        _embed_model = SentenceTransformer(model_path)
    except Exception as e:
        print(f"⚠️ embedding 模型加载失败: {e}")
    return _embed_model


def _client(api_key, base_url):
    """缺少 Key 时返回 None，避免服务直接启动失败。"""
    if not api_key or not base_url:
        return None
    return AsyncOpenAI(api_key=api_key, base_url=base_url)


# 主脑客户端（Gemini / OpenAI 兼容）
client_main = _client(Config.LLM_API_KEY, Config.LLM_BASE_URL)
# 意图客户端（已废弃，保留兼容）
client_intent = _client(Config.PROFILE_KEY, Config.PROFILE_BASE)
# 语音客户端（SiliconFlow）
client_audio = _client(Config.SILICON_KEY, Config.SILICON_BASE)


class AIService:
    @staticmethod
    async def chat(messages: list,image_base64: str = None, timeout=30.0):
        """
        ✅ 核心方法：主脑接口
        一次性完成 [思考 -> 回复 -> 记忆操作]
        """
        if client_main is None:
            return json.dumps({
                "reply": "（还没有配置 LLM 密钥喵）",
                "emotion": "neutral",
                "memory_operation": {},
                "thought": "LLM 未配置",
            })
        try:
            # 强制要求 JSON 模式
            if image_base64:
                # 获取 messages 里的最后一条（用户的新消息），把它改成多模态格式
                last_msg = messages[-1]
                content_text = last_msg["content"]
                
                # 构造带图消息
                new_content = [
                    {"type": "text", "text": content_text},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
                # 替换原来的纯文本消息
                messages[-1]["content"] = new_content
            response = await client_main.chat.completions.create(
                model=Config.LLM_MODEL,
                messages=messages,
                temperature=0.5,
                max_tokens=4096,
                timeout=timeout,
                response_format={"type": "json_object"} 
            )
            content = response.choices[0].message.content
            return content  # ✅ 返回原始 JSON 字符串
        except Exception as e:
            print(f"❌ 主脑思考失败: {e}")
            # 兜底返回，防止 main.py 崩溃
            return json.dumps({
                "reply": "（大脑短路中...）",
                "emotion": "daze",
                "memory_operation": {},
                "thought": f"API调用出错: {str(e)}"
            })

    @staticmethod
    async def analyze_intent(text: str):
        """
        使用 DeepSeek 快速分析用户意图 (勿扰/普通对话)
        """
        system_prompt = """
        你是一个意图分析器。分析用户的输入，返回 JSON 格式：
        {"action": "silence"} - 如果用户表示忙、别吵、安静。
        {"action": "chat"} - 普通聊天。
        """
        try:
            response = await client_intent.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                response_format={"type": "json_object"} # 强制 JSON
            )
            return response.choices[0].message.content
        except:
            return '{"action": "chat"}'

    @staticmethod
    async def text_to_speech(text: str) -> str:
        """
        调用本地 TTS 微服务（GPT-SoVITS），把音频存进临时目录并返回静态路径。
        参考音频与提示文本由 TTS 服务的默认配置决定；失败返回空串（前端降级显示文字）。
        """

        def _sync_tts_call():
            payload = {
                "text": text,
                "text_language": "zh",
            }
            try:
                response = requests.post(
                    Config.TTS_SERVICE_URL, json=payload, timeout=Config.TTS_TIMEOUT
                )
                if response.status_code != 200:
                    print(f"[TTS Error] Status: {response.status_code}")
                    return ""
                filename = f"{uuid.uuid4().hex}.wav"
                (audio_dir() / filename).write_bytes(response.content)
                return f"/static/{filename}"
            except Exception as e:
                print(f"[TTS Network Error] {e}")
                return ""

        return await asyncio.to_thread(_sync_tts_call)

    @staticmethod
    async def speech_to_text(audio_base64: str):
        
     #   调用 SenseVoice 识别 WebM/WAV 音频
        
        if client_audio is None:
            print("⚠️ 未配置 SILICON_API_KEY，语音识别不可用")
            return ""
        try:
            #  解码 Base64 -> Bytes
            audio_bytes = base64.b64decode(audio_base64)
            
            # 包装成类似文件的对象 (name 属性很重要，要是 .webm)
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = "input.webm" 

            #  发送请求
            transcript = await client_audio.audio.transcriptions.create(
                model=Config.STT_MODEL,
                file=audio_file
            )
            return transcript.text
        except Exception as e:
            print(f"❌ STT 失败: {e}")
            return ""

    @staticmethod
    async def get_embedding(text: str):
        """
        使用本地 sentence_transformers 模型生成向量。
        模型已在模块加载时初始化，通过 asyncio.to_thread 避免阻塞事件循环。
        """
        try:
            model = _get_embed_model()
            if not text or model is None:
                return []
            vector = await asyncio.to_thread(model.encode, text)
            return vector.tolist()
        except Exception as e:
            print(f"❌ 本地嵌入生成失败: {e}")
            return []
