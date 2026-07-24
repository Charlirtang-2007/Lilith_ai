import base64
import io
from openai import AsyncOpenAI
from config import Config
import json
from sentence_transformers import SentenceTransformer
import requests
import asyncio
import os
import uuid

# 全局加载一次模型
# MODEL_PATH = r'D:/models/models/damo--nlp_corom_sentence-embedding_chinese-base/snapshots/master'

MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH")
if not MODEL_PATH:
    # 如果没配置，给个默认相对路径
    MODEL_PATH = "./models/sentence-embedding"

if os.path.exists(MODEL_PATH):
    print(f"✅ 加载本地 embedding 模型: {MODEL_PATH}")
    embed_model = SentenceTransformer(MODEL_PATH)
else:
    print(f"⚠️ 模型路径不存在: {MODEL_PATH}，embedding 功能将不可用")
    embed_model = None

#  主脑客户端 (Gemini)
client_main = AsyncOpenAI(
    api_key=Config.LLM_API_KEY,
    base_url=Config.LLM_BASE_URL
)

# 意图客户端 (DeepSeek) (暂时废弃)
client_intent = AsyncOpenAI(
    api_key=Config.PROFILE_KEY,
    base_url=Config.PROFILE_BASE
)

# 语音客户端 (SiliconFlow)
client_audio = AsyncOpenAI(
    api_key=Config.SILICON_KEY,
    base_url=Config.SILICON_BASE
)

class AIService:
    @staticmethod
    async def chat_with_neuro_brain(messages: list,image_base64: str = None, timeout=30.0):
        """
        ✅ 核心方法：主脑接口
        一次性完成 [思考 -> 回复 -> 记忆操作]
        """
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
                "emotion": "dizzy",
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
    async def text_to_speech(text: str, emotion: str) -> str:
        """
         异步调用本地 9880 TTS 服务，把音频存为临时文件，返回静态路径。
        """

        # 1. 定义一个同步的函数，用来真正跑 HTTP 请求
        def _sync_tts_call():
            url = Config.TTS_SERVICE_URL  # 在 config.py 里新增

            payload = {
                "refer_wav_path": Config.TTS_REF_WAV_PATH,
                "prompt_text": Config.TTS_PROMPT_TEXT,
                "prompt_language": "zh",
                "text": text,
                "text_language": "zh"
            }
            try:
                response = requests.post(url, json=payload, timeout=300)
                if response.status_code == 200:
                    # 1. 拿到二进制数据
                    audio_data = response.content

                    # 2. 生成唯一文件名，避免多人对话时文件冲突
                    filename = f"{uuid.uuid4().hex}.wav"
                    file_path = os.path.join("temp_audios", filename)

                    # 3. 写入本地硬盘
                    with open(file_path, "wb") as f:
                        f.write(audio_data)

                    # 4. 返回前端可以直接访问的 URL 路径
                    return f"/static/{filename}"
                else:
                    print(f"[TTS Error] Status: {response.status_code}")
                    return ""
            except Exception as e:
                print(f"[TTS Network Error] {e}")
                return ""

                # 扔给后台线程跑，不卡主循环
        audio_url = await asyncio.to_thread(_sync_tts_call)
        return audio_url

    @staticmethod
    async def speech_to_text(audio_base64: str):
        
     #   调用 SenseVoice 识别 WebM/WAV 音频
        
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
            if not text or not embed_model:
                return []
            vector = await asyncio.to_thread(embed_model.encode, text)
            return vector.tolist()
        except Exception as e:
            print(f"❌ 本地嵌入生成失败: {e}")
            return []
