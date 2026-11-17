# 架构说明

```
┌─────────────────────────────┐
│ frontend/app  (Tauri+SPA)   │  Live2D 渲染 / 情绪映射 / WebSocket / 音频播放
└──────────────┬──────────────┘
               │ ws://127.0.0.1:8000/ws
┌──────────────▼──────────────┐
│ backend  (FastAPI)          │  对话主脑 / 记忆 / 闹钟 / 主动发言 / 截图
└──────────────┬──────────────┘
               │ HTTP POST /
┌──────────────▼──────────────┐
│ tts  (GPT-SoVITS, 可选)     │  本地音色合成，返回 WAV
└─────────────────────────────┘
```

## 后端模块

| 文件 | 职责 |
| :--- | :--- |
| `main.py` | FastAPI 入口、WebSocket 路由、`PetBrain`（对话流程、提示词、记忆操作） |
| `game_loop.py` | 后台循环：闹钟检查 + 无聊检测（主动发言） |
| `alarms.py` | 闹钟持久化（`data/alarms.json`，支持 once/daily/weekly） |
| `memory.py` | 双轨记忆：ChromaDB 情景记忆 + JSON 事实库 |
| `services.py` | LLM / STT / TTS / embedding 封装（缺 Key、缺模型时优雅降级） |
| `config.py` | 环境变量与数据目录（`data/`） |
| `personas/pet.txt` | 角色卡：只写性格语气，`{{PET_NAME}}` 由 `PET_NAME` 注入 |
| `tools.py` | 屏幕截图（视觉输入） |

## WebSocket 协议

前端 → 后端：

| type | payload |
| :--- | :--- |
| `text_input` | `{"text": "..."}` |
| `audio_input` | `{"audio_base64": "<webm>"}` |
| `set_dnd_mode` | `{"enabled": true}` |
| `interrupt` | `{}` |

后端 → 前端：

| type | payload |
| :--- | :--- |
| `state_update` | `{"state": "thinking" \| "speaking" \| "idle"}` |
| `audio_chunk` | `{"text", "audio_url", "expression", "is_alarm"?}` |
| `system_message` | `{"text": "..."}` |

## 情绪 → 动画

- 情绪标签固定 18 种（见 `backend/main.py::ALLOWED_EMOTIONS`）。
- 前端在 `src/config.js` 的 `EMOTION_MOTIONS` 里把情绪映射到 Live2D 动作组，
  找不到对应动作时保持 idle，不会报错。
- 想换模型只改 `static/live2d/<模型目录>/` 与 `VITE_LIVE2D_MODEL_DIR`。

## 数据目录

所有运行时产物都在 `data/`（可用 `LILITH_DATA_DIR` 覆盖）：

```
data/
├── chroma/          # ChromaDB 向量库
├── user_facts.json  # 用户事实
├── alarms.json      # 闹钟
└── audio/           # TTS 临时音频（断开连接时清理）
```
