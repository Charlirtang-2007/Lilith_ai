# 🎮 Lilith · AI 桌宠
## 借鉴于不存在的你和我游戏角色莉莉丝制作
> 一个可爱毒舌的 AI 桌宠（inspired by Neuro），集成 Spine 骨骼动画、语音交互、向量记忆系统。使用现代化前后端技术栈，提供流畅的实时对话体验。

---

## 📖 项目简介

**Lilith** 是一款运行在桌面端的 AI 虚拟伴侣应用。它拥有一个由 **Spine** 驱动的 2D 角色，能够通过语音或文字与用户进行自然对话，并根据对话情绪实时切换角色的表情与动作。

项目采用 **前后端分离 + TTS 微服务** 架构，核心推理依赖大语言模型（Gemini），语音合成基于 GPT-SoVITS 微调音色，所有对话记忆（向量 + 事实）均存储在本地，保障隐私安全。

---

## ✨ 项目特性

| 特性 | 说明 |
| :--- | :--- |
| 🤖 **AI 对话** | 集成 Gemini 大语言模型，支持多模态视觉输入（屏幕截图） |
| 🎨 **Spine 角色** | 2D 骨骼动画驱动，支持 18 种情绪实时映射，自动待机切换 |
| 💾 **向量记忆系统** | ChromaDB 长期记忆 + JSON 事实库，AI 能持久化学习用户信息（记忆带时间戳） |
| 🎙️ **语音交互** | 麦克风输入（云端 STT）+ 文字转语音（本地 TTS 微服务），长按 F2 启用语音输入 |
| 🔕 **勿扰模式** | 可让 AI 进入静默模式（AI 将不会主动说话），AI 也会自行判断是否闭嘴 |
| 🔄 **主动发言** | AI 具备“无聊检测”机制，用户长时间静默时主动发起对话，支持打断操作 |
| 👁️ **视觉感知** | 输入内容含有“看看”“屏幕”等关键词时，自动截取当前屏幕并传入 AI 理解 |
| 🪟 **跨平台桌面** | Tauri + SvelteKit，支持 Windows / macOS / Linux |
| 📊 **状态机设计** | 完整的对话状态管理（Idle / Thinking / Speaking） |

---

## 🏗️ 系统架构

本项目采用 **前后端分离 + TTS 微服务** 三端架构：

```
┌─────────────────────────────────────────────────────────────┐
│  用户交互                                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  前端 (Tauri + SvelteKit)                                 │
│  · Spine 角色渲染 (Spine Runtime)                         │
│  · 情绪驱动动画 (18 种情绪映射 + 自动待机)                │
│  · WebSocket 实时通信                                     │
│  · 音频捕获与播放                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  后端 (FastAPI - Port 8000)                               │
│  · 主脑推理 (Gemini，强制 JSON)                           │
│  · 双轨记忆系统 (ChromaDB + Sentence-BERT)               │
│  · 主动发言控制器 (Game Loop，动态无聊阈值)               │
│  · 屏幕截图工具（视觉感知）                                │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (TTS 合成请求)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  TTS 微服务 (GPT-SoVITS - Port 9880)                      │
│  · GPT-SoVITS v2Pro 推理引擎                              │
│  · 微调音色 (Lilith)                                      │
│  · 返回 WAV 音频流                                        │
└─────────────────────────────────────────────────────────────┘
```

### 三端职责

| 端 | 技术栈 | 核心职责 |
| :--- | :--- | :--- |
| **前端** | Tauri 2.x + SvelteKit 2.x + Spine Runtime | 角色渲染、WebSocket 通信、音频 I/O |
| **后端** | FastAPI + Uvicorn + ChromaDB | AI 对话、记忆系统、状态管理、截图视觉 |
| **TTS** | GPT-SoVITS v2Pro（独立微服务） | 高质量语音合成 |

> **注意**：语音识别（STT）通过 SiliconFlow 云端 API 实现（SenseVoice 模型），需联网使用。

---

## 📋 系统要求

### 后端
- Python 3.10+（推荐 3.13）
- 相关 API 密钥（见下方配置）

### 前端
- Node.js 20+
- Bun 1.0+（推荐）
- Rust（Tauri 依赖）

---

## 🚀 快速开始

### 1️⃣ 克隆仓库

```bash
git clone <repository-url>
cd AI-Desktop-Pet
```

### 2️⃣ 后端环境配置

#### 步骤 1：安装 Python 依赖

```bash
cd backend
# 建议创建虚拟环境
# python -m venv venv
# source venv/bin/activate (Linux/Mac) 或 venv\Scripts\activate (Windows)

pip install -r requirements.txt
```

#### 步骤 2：配置环境变量

在 `backend/.env` 文件中填入 API 密钥（复制 `.env.example` 并重命名）：

```env
# ===== LLM 主脑 (Gemini / OpenAI 兼容) =====
LLM_BASE_URL="https://api.n1n.ai/v1"      # 中转站，可改用其他 OpenAI 格式端点
LLM_API_KEY="your-api-key-here"
LLM_MODEL="gemini-2.0-flash-exp"          # 选用 Gemini 以支持多模态视觉输入

# ===== 语音服务 (SiliconFlow) =====
# 注册地址: https://siliconflow.cn/
SILICON_API_KEY="your-siliconflow-key"
SILICON_BASE_URL="https://api.siliconflow.cn/v1"
TTS_MODEL="FunAudioLLM/CosyVoice2-0.5B"
TTS_VOICE="FunAudioLLM/CosyVoice2-0.5B:anna"
STT_MODEL="FunAudioLLM/SenseVoiceSmall"

# ===== 本地 TTS 微服务 (可选) =====
TTS_SERVICE_URL="http://127.0.0.1:9880"

# ===== 代理 (可选) =====
PROXY_URL=""
```

#### 步骤 3：运行后端服务

```bash
python main.py
```

后端将在 `ws://localhost:8000/ws` 启动 WebSocket 服务，并在 `http://localhost:8000/api/current_emotion` 提供情绪状态查询。

### 3️⃣ 前端环境配置

#### 步骤 1：安装 Bun（如未安装）

```bash
curl -fsSL https://bun.sh/install | bash
```

#### 步骤 2：安装依赖

```bash
cd frontend
bun install
```

#### 步骤 3：配置 Tauri 环境

参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/) 安装系统依赖：
- **Windows**：Visual Studio Build Tools + WebView2
- **macOS**：Xcode Command Line Tools
- **Linux**：`libwebkit2gtk`、`libappindicator` 等

#### 步骤 4：开发模式运行

```bash
bun run tauri dev
```

#### 步骤 5：构建生产版本

```bash
bun run tauri build
```

生成的可执行文件位于 `frontend/src-tauri/target/release/`。

### 4️⃣（可选）启动本地 TTS 微服务

> 如不使用本地 TTS，后端会自动降级为云端 TTS（CosyVoice）或纯文本回复。

```bash
cd tts
# 需提前下载 GPT-SoVITS 模型与微调权重
python api.py -dr "ref_audio/lilith_ref.wav" -dt "这样一来我们就离得更近了所以" -dl "zh" -d cpu -p 9880
```

> TTS 服务启动较慢（约 30~60 秒），请耐心等待 `INFO: Uvicorn running on http://0.0.0.0:9880`

---

## 📂 项目结构

```
AI-Desktop-Pet/
├── backend/                    # Python 后端服务 (FastAPI)
│   ├── main.py                # WebSocket 路由、状态机、游戏循环
│   ├── services.py            # AI 能力封装（LLM、TTS、STT、嵌入）
│   ├── memory.py              # 向量记忆系统（ChromaDB + JSON 事实库）
│   ├── config.py              # 环境变量管理
│   ├── tools.py               # 工具函数（屏幕截图等）
│   ├── Lilith_tsc.txt         # 角色人设提示词
│   ├── .env                   # 环境变量配置（不提交）
│   ├── .env.example           # 环境变量模板
│   ├── requirements.txt       # Python 依赖
│   ├── memory_db/             # ChromaDB 数据库文件（自动生成）
│   ├── temp_audios/           # TTS 音频缓存（自动清理）
│   └── user_facts.json        # 用户事实记忆（自动生成）
│
├── frontend/                   # Tauri + SvelteKit 前端
│   ├── src/
│   │   ├── lib/
│   │   │   ├── SpineRendererBase.js   # ★ 核心：情绪驱动 + Spine 渲染
│   │   │   ├── BaseRenderer.js        # 渲染基类
│   │   │   └── SpineCommon.js         # Spine 通用工具
│   │   ├── routes/                    # SvelteKit 页面
│   │   └── app.html
│   ├── tauri.conf.json        # Tauri 配置（无边框透明窗口）
│   ├── package.json           # 依赖：Tauri、SvelteKit
│   └── vite.config.ts
│
├── tts/                        # (可选) GPT-SoVITS 本地微服务
│   ├── api.py                 # TTS API 入口
│   ├── config.py              # 模型路径配置
│   ├── sv.py                  # 说话人验证模块
│   ├── gpt_sovits/            # Git Submodule (官方仓库)
│   ├── weights/               # 微调音色权重
│   ├── ref_audio/             # 参考音频
│   ├── run_tts.sh             # Linux/macOS 启动脚本
│   └── run_tts.bat            # Windows 启动脚本
│
├── .env.example
├── .gitignore
├── LICENSE
└── README.md                  # 本文件
```

---

## 🔌 WebSocket API

**地址**：`ws://localhost:8000/ws`

### 前端 → 后端

| type | payload | 说明 |
|------|---------|------|
| `text_input` | `{ "text": "你好" }` | 发送文本消息 |
| `audio_input` | `{ "audio_base64": "..." }` | 发送音频（Base64 编码，WebM 格式） |
| `set_dnd_mode` | `{ "enabled": true }` | 设置勿扰模式 |
| `interrupt` | `{}` | 打断当前 AI 回复 |

### 后端 → 前端

| type | payload | 说明 |
|------|---------|------|
| `state_update` | `{ "state": "thinking" }` | AI 状态更新（Idle/Thinking/Speaking） |
| `audio_chunk` | `{ "text": "...", "audio_url": "/static/xxx.wav", "expression": "smile" }` | AI 回复（含 TTS 音频 URL） |

### HTTP 接口

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/` | 健康检查 |
| GET | `/api/current_emotion` | 获取当前情绪状态（前端轮询用） |

---

## 🧠 核心机制

### 1. 后端：主脑推理流程

1. **用户输入** → WebSocket 接收 `text_input` 或 `audio_input`
2. **语音转文字**（仅音频）→ `AIService.speech_to_text()`（SenseVoice 云端 API）
3. **构建 System Prompt** → 包含角色人设、已知事实、相关情景记忆（向量检索 Top 3 + 时间加权）
4. **调用主脑** → `AIService.chat_with_neuro_brain()`（Gemini）
   - 支持多模态（截图视觉，触发关键词："看看""屏幕""截图"）
   - 强制 JSON 输出格式
5. **解析 JSON** → 提取 `reply`、`emotion`、`memory_operation`
6. **执行记忆更新** → `MemorySystem.execute_updates()`
7. **TTS 合成** → 调用本地 TTS 微服务（`http://127.0.0.1:9880`）或云端 TTS 兜底
8. **推送前端** → `audio_chunk`（含 `audio_url` + `emotion`）

### 2. 前端：情绪驱动动画流程

- **情绪轮询**：每 3 秒 GET `http://localhost:8000/api/current_emotion`
- **情绪映射**：根据当前时段（白天/夜晚 22:30 为界）从预定义池中选择对应动画
- **自动待机**：每 5 分钟从 idle 池随机切换，避免角色静止
- **18 种情绪支持**：`angry`、`embarrassed`、`calm`、`daze`、`fear`、`blink`、`sad`、`sleepy`、`smile`、`surprise`、`wronged`、`lie_down`、`stand`、`sleep`、`show`、`sit`、`birthday`、`neutral`

### 3. 主动发言机制（Game Loop）

- 后台异步任务每秒检查状态
- 用户静默超过 `BOREDOM_THRESHOLD`（默认 600 秒）且非勿扰模式时，自动触发 AI 主动对话
- 每次主动发言后阈值翻倍（上限 1 小时），逐步降低打扰频率

---

## 📦 依赖说明

### 后端 (Python)

| 包名 | 用途 |
|------|------|
| `fastapi` + `uvicorn` | WebSocket + HTTP 服务 |
| `openai` | LLM / TTS / STT API 客户端 |
| `chromadb` | 向量数据库 |
| `sentence-transformers` | 中文语义嵌入 |
| `python-dotenv` | 环境变量管理 |
| `pillow` + `pyautogui` | 屏幕截图 |

### 前端 (Node.js / Bun)

详见 `frontend/package.json`，主要包括：
- `svelte` / `@sveltejs/kit` – UI 框架
- `@tauri-apps/api` – Tauri 原生 API
- `@tauri-apps/plugin-*` – 插件（dialog、fs、opener、window-state）
- `mediabunny` – 音频处理

---

## 🔍 故障排查

### 后端启动失败

```bash
# 检查 Python 版本（需要 3.10+）
python --version

# 检查依赖安装
pip list | grep fastapi

# 查看详细错误
python -c "from services import AIService"
```

### WebSocket 连接失败

- 确保后端已启动：`python main.py`
- 检查前端 WebSocket 地址配置（默认 `ws://localhost:8000/ws`）
- 检查防火墙是否开放 8000 端口

### Spine 模型不显示

- 验证模型文件路径是否正确（`.skel`/`.json` + `.atlas` + 纹理）
- 查看浏览器开发者工具控制台是否有错误
- 检查 Tauri 静态资源配置

### 语音识别无法工作

- 检查麦克风权限（操作系统）
- 验证 SiliconFlow API Key 是否正确
- 查看网络连接和代理设置

---

## 🛠️ 开发指南

### 修改 AI 人设

编辑 `backend/Lilith_tsc.txt` 或 `backend/main.py` 中 `build_system_prompt()` 方法内的系统 Prompt。

### 添加新的情绪动画映射

编辑 `frontend/src/lib/SpineRendererBase.js` 中的 `_emotionAnimConfig` 对象：

```javascript
this._emotionAnimConfig = {
  'happy': {
    day: ['emoji_happy_1', 'emoji_happy_2'],
    night: ['stand_pajamas_happy'],
  },
  // ...
};
```

### 扩展记忆功能

- **短期记忆**（对话历史）：修改 `main.py` 中的 `history` 列表管理
- **长期记忆**（向量存储）：编辑 `memory.py` 中的 Embedding 和检索逻辑
- **事实库**（JSON）：直接修改 `user_facts.json` 或通过 `memory_operation` 更新

### 添加新的工具函数

在 `backend/tools.py` 中新增方法，然后在 `main.py` 中调用。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献规范
- 代码风格遵循 ESLint / Prettier（前端）和 PEP8（后端）
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)
- 新增功能请同步更新文档

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

本项目在开发过程中参考/使用了以下优秀开源项目与资源：

| 项目 | 用途 | 许可证 |
| :--- | :--- | :--- |
| [Spive2D](https://github.com/lmmtrr/spive2d) | 前端 Spine 渲染架构（SvelteKit + Tauri） | MIT |
| [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | TTS 语音合成引擎（微调音色） | MIT |
| [Neuro-sama](https://www.twitch.tv/vedal987) | 角色人设与交互风格灵感 | - |
| **Spine Runtimes** | 2D 骨骼动画引擎 | 专有 |
| **SiliconFlow** | 云端 TTS/STT API 服务 | - |

> **特别说明**：本项目前端渲染层基于 Spive2D 的渲染架构二次开发，Spine 渲染核心（`SpineRendererBase.js`、`BaseRenderer.js`、`SpineCommon.js`）继承自 Spive2D 的设计思路。由于作者能力有限，前端部分主要由 AI 辅助完成，有不足之处请多指教 🙏


---
## 声明：本项目全开源禁止商用，关于第三方合作项目，若有不便之处请联系更改

**最后更新**：2026年7月