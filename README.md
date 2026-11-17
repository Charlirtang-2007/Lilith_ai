# 🎮 桌面宠物 · AI Desktop Pet

> 桌面上的 AI 伙伴：Live2D 角色 + 大模型对话 + 本地语音合成 + 长期记忆 + 主动搭话。
> 前端 Tauri（轻量窗口），后端 FastAPI，语音 GPT-SoVITS（可选）。

---

## ✨ 功能

| 特性 | 说明 |
| :--- | :--- |
| 🤖 AI 对话 | OpenAI 兼容端点（Gemini 等），强制 JSON 输出：`reply / emotion / memory_operation` |
| 🎨 Live2D 角色 | 18 种情绪映射到动作/表情，找不到动作自动回退 idle |
| 💾 双轨记忆 | ChromaDB 向量情景记忆 + JSON 事实库（缺 embedding 模型自动降级） |
| 🎙️ 语音 | 长按 F2 语音输入（SiliconFlow SenseVoice）+ GPT-SoVITS 本地 TTS（不可用时降级文字） |
| 🔕 勿扰模式 | AI 可自行判断闭嘴，或前端手动开关 `set_dnd_mode` |
| 🔄 主动发言 | 用户静默超阈值自动发起对话，阈值逐次翻倍（上限 1 小时） |
| ⏰ 闹钟 | AI 可创建 once / daily / weekly 闹钟，到点语音提醒，持久化到磁盘 |
| 👁️ 视觉 | 输入含「看看 / 屏幕 / 截图」时自动截图传模型（需开启 `ENABLE_VISION`） |
| 🪟 跨平台 | Tauri + SvelteKit，Windows / macOS / Linux |

---

## 📂 目录结构

```
.
├── backend/                 # FastAPI 后端
│   ├── main.py              # 入口：WebSocket、PetBrain、对话流程
│   ├── game_loop.py         # 闹钟检查 + 无聊检测（主动发言）
│   ├── alarms.py            # 闹钟持久化
│   ├── memory.py            # 向量记忆 + 事实库
│   ├── services.py          # LLM / STT / TTS / embedding
│   ├── config.py            # 环境变量、数据目录
│   ├── tools.py             # 屏幕截图
│   ├── personas/pet.txt     # 角色卡（只写性格，不绑角色名）
│   └── .env.example
├── frontend/app/            # Tauri + SvelteKit 桌宠窗口
│   ├── src/
│   │   ├── config.js        # 后端地址 / 模型目录 / 情绪→动作映射
│   │   ├── routes/+page.svelte
│   │   └── lib/renderer/    # Live2D 渲染器
│   ├── static/lib/          # Pixi / pixi-live2d-display / Cubism Core
│   ├── static/live2d/       # Live2D 模型目录
│   └── src-tauri/           # Tauri 壳（只负责窗口行为）
├── tts/                     # (可选) GPT-SoVITS 本地 TTS 微服务
├── tools/                   # start.sh / start.bat 一键启动
├── docs/                    # ARCHITECTURE.md · ASSETS.md · PRESENCE.md（设计稿）
└── data/                    # 运行时数据（自动生成，不提交）
```

---

## 🚀 快速开始

### 1. 后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # 填入 LLM_API_KEY / LLM_BASE_URL（STT 需 SILICON_API_KEY）
python main.py          # http://127.0.0.1:8000
```

> 没有填 Key 也能启动：AI 会回一句占位内容，方便先跑通界面。

### 2. 前端

```bash
cd frontend/app
bun install            # 没有 bun 用 npm install
bun run tauri dev      # 需要 Rust 与系统 WebView 依赖（见 Tauri 官方 prerequisites）
```

### 3. 本地 TTS（可选）

```bash
cd tts
python api.py -dr ref_audio/default.wav -dt "参考音频文本" -dl zh -d cpu -p 9880
```

后端会自动请求 `TTS_SERVICE_URL`（默认 `http://127.0.0.1:9880`），失败则纯文字回复。

### 4. 一键启动

```bash
./tools/start.sh            # 后端 + 桌宠
./tools/start.sh --with-tts # 再加本地 TTS
```

---

## ⚙️ 配置

### 后端 `backend/.env`

| 变量 | 说明 |
| :--- | :--- |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 主脑（OpenAI 兼容） |
| `SILICON_API_KEY` / `STT_MODEL` | 语音识别 |
| `TTS_SERVICE_URL` / `TTS_TIMEOUT` | 本地 TTS |
| `ENABLE_VISION` | 屏幕截图视觉 |
| `PET_NAME` | 角色称呼（注入角色卡） |
| `PERSONA_PATH` | 角色卡路径，默认 `personas/pet.txt` |
| `BOREDOM_THRESHOLD` / `BOREDOM_MAX` | 主动发言初始阈值 / 上限（秒） |
| `ALARM_ENABLED` / `ALARM_CHECK_INTERVAL` | 闹钟 |
| `LILITH_DATA_DIR` | 数据目录，默认 `./data` |

### 前端 `frontend/app/.env`

| 变量 | 默认值 |
| :--- | :--- |
| `VITE_BACKEND_HTTP` | `http://127.0.0.1:8000` |
| `VITE_BACKEND_WS` | 由 HTTP 推导 |
| `VITE_LIVE2D_MODEL_DIR` | `live2d/character` |
| `VITE_MODEL_SCALE` | `1` |
| `VITE_IDLE_SWITCH_MS` | `300000` |

---

## 🎨 更换角色

1. 把 Live2D 模型（`*.model3.json` + `.moc3` + 纹理…）放进 `frontend/app/static/live2d/<名字>/`
2. 设置 `VITE_LIVE2D_MODEL_DIR=live2d/<名字>`
3. 在 `frontend/app/src/config.js` 的 `EMOTION_MOTIONS` 里把情绪映射到模型里的动作名
4. 改 `backend/personas/pet.txt` 与 `PET_NAME` 调整性格

> ⚠️ 模型与角色形象必须是你自己所有，或授权明确允许再分发。见 [docs/ASSETS.md](docs/ASSETS.md)。

---

## 🔌 接口

- `ws://127.0.0.1:8000/ws` — 对话 / 状态 / 音频
- `GET /api/current_emotion` — 当前情绪
- `GET /`、`GET /ping` — 健康检查

协议细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 🧭 设计稿：存在感与打扰的边界

关系状态机的完整设计（六个状态、阈值策略、三层表现映射、数据模型、实现方案）见 [docs/PRESENCE.md](docs/PRESENCE.md)。

## 🔒 安全

- TTS 服务默认**关闭** `/set_model`、`/control`、`/change_refer`，且**不接受请求级别的参考音频路径**（需要时设 `TTS_ALLOW_ADMIN=1`，仅限本机调试）。
- 权重加载使用 `weights_only=True`，避免恶意 `.pth` 反序列化执行代码。
- 后端默认只监听 `127.0.0.1`。

---

## 📄 许可

MIT（见 [frontend/app/LICENSE](frontend/app/LICENSE)）。第三方组件授权见 [docs/ASSETS.md](docs/ASSETS.md)。
