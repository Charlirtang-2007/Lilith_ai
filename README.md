# 🎮 Lilith · AI 桌面伴侣

> Live2D 角色 + 大模型对话 + 本地语音 + 长期记忆 + 主动搭话。
> 前端 Tauri + SvelteKit，后端 FastAPI，语音 GPT-SoVITS（可选）。

这是一个可以直接挂在桌面上的透明角色窗口。UI 按成熟桌面宠物产品的交互习惯重做过：
角色即界面、底部指挥坞、悬浮台词、抽屉式对话、参数化表情、自动点击穿透。
渲染与窗口链路的细节见 [docs/UI.md](docs/UI.md)。

---

## ✨ 功能现状

| 功能 | 状态 | 说明 |
| :--- | :--- | :--- |
| AI 对话 | 可用 | 任意 OpenAI 兼容端点；后端强制 JSON：`reply / emotion / memory_operation` |
| Live2D 渲染 | 可用 | 透明画布、底部锚定、DPR 画质、缩放 / 偏移 / 不透明度、WebGL 丢失提示 |
| 情绪 → 表情 | 可用 | 18 种情绪；参数化 look + 运行时加载 `.exp3.json`，不修改模型文件 |
| 表情面板 | 可用 | 「自动 / 中性 / 微笑 / 害羞 / …」+ 模型自带的 8 个表情文件 |
| 口型同步 | 可用 | TTS 音频 RMS 驱动 `ParamMouthOpenY`；波形不可用时合成备用波形 |
| 长期记忆 | 可用 | ChromaDB 向量检索 + `data/user_facts.json`；缺 embedding 模型自动降级 |
| 语音识别 | 前端已接 | 浏览器支持 `MediaRecorder` 时显示麦克风；后端需 `SILICON_API_KEY` |
| 语音合成 | 可用 | 优先本机 GPT-SoVITS（9880），不可用时降级为纯文字 |
| 勿扰模式 | 可用 | 指挥坞 / 设置 / 右键菜单均可切换；重连时自动同步后端 |
| 主动发言 | 可用 | 静默超阈值自动发起，阈值逐次翻倍（上限 1 小时） |
| 闹钟 | 可用 | `once / daily / weekly`，持久化到 `data/alarms.json`，到点语音播报 |
| 屏幕视觉 | 可用 | 输入含「看看 / 屏幕 / 截图」且 `ENABLE_VISION=true` 时截图传模型 |
| 桌面形态 | 可用 | 透明无边框、置顶、自动点击穿透、拖拽窗口、右键菜单、滚轮缩放 |
| 对话记录 | 本地内存 | 最多 200 条，刷新 / 重启后清空；未写入磁盘 |
| 设置持久化 | 可用 | localStorage（构图 / 表演 / 窗口 / 声音 / 免打扰） |
| 关系状态机 | 未实现 | 设计稿见 [docs/PRESENCE.md](docs/PRESENCE.md) |

### 交互速查

| 操作 | 行为 |
| :--- | :--- |
| 左键单击角色 | 戳一戳：弹跳 + 害羞 + 随机反应 |
| 左键拖动角色 | 拖动窗口 |
| 双击角色 | 打开对话 |
| 右键角色 | 快捷菜单 |
| 角色上滚轮 | 缩放（0.6×–1.8×） |
| `Ctrl/Cmd + K` | 打开对话并聚焦输入 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `Esc` | 逐层关闭菜单 / 设置 / 表情 / 对话 |
| `Enter` / `Shift + Enter` | 发送 / 换行（兼容中文输入法） |

---

## 🚀 快速开始

### 1. 后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # 填 LLM_API_KEY / LLM_BASE_URL
python main.py                                        # http://127.0.0.1:8001
```

没填 Key 也能启动，对话会返回占位文本，方便先跑通链路。

### 2. 前端

```bash
cd frontend/app
npm install          # 或 pnpm install —— 二选一，不要混用
npm run tauri dev    # 需 Rust 与系统 WebView 依赖（见 Tauri prerequisites）
```

> Wayland 平铺合成器（Niri / Hyprland / sway）可能把窗口按列宽铺开。给 `lilith-pet`
> 加一条 floating + 固定 420×720 的窗口规则即可，Niri 示例见
> [docs/UI.md](docs/UI.md#9-wayland--平铺合成器)。
>
> Linux / WebKitGTK 从旧前端升级后若出现旧页面、404 已删除文件或白屏，清一次
> WebKit 缓存：`rm -rf ~/.local/share/cn.lilith.desktop-pet/WebKitCache`，
> 或用临时数据目录启动：`XDG_DATA_HOME=$PWD/.cache-dev npm run tauri dev`。

### 3. 本地 TTS（可选）

```bash
cd tts
python api.py -dr ref_audio/default.wav -dt "参考音频文本" -dl zh -d cpu -p 9880
```

后端请求 `TTS_SERVICE_URL`（默认 `http://127.0.0.1:9880`），失败则纯文字回复。

### 4. 一键启动

```bash
./tools/start.sh             # 后端 + 桌宠
./tools/start.sh --with-tts  # 再加本地 TTS
```

### 5. 没有后端也能看 UI

```bash
python tools/dev-mock/server.py
# 另开终端
cd frontend/app
VITE_BACKEND_HTTP=http://127.0.0.1:8765 npm run dev
```

浏览器打开 http://localhost:1420 即可预览完整 UI（浏览器模式没有置顶 / 穿透，但有夜色调预览背景）。
Mock 支持 `/ping` 与 `/api/dev/emit`：

```bash
curl "http://127.0.0.1:8765/api/dev/emit?text=你好&emotion=smile"
```

---

## 📂 目录结构

```
Lilith_ai/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 入口：WebSocket、PetBrain、对话流程
│   ├── game_loop.py            # 闹钟检查 + 无聊检测（主动发言）
│   ├── alarms.py               # 闹钟持久化
│   ├── memory.py               # 向量记忆 + 事实库
│   ├── services.py             # LLM / STT / TTS / embedding 封装
│   ├── config.py               # 环境变量与数据目录
│   ├── tools.py                # 屏幕截图（懒加载 pyautogui）
│   ├── personas/pet.txt        # 角色卡（性格语气，{{PET_NAME}} 注入称呼）
│   └── .env.example            # 后端环境变量模板
│
├── frontend/app/               # Tauri + SvelteKit 桌宠窗口
│   ├── src/
│   │   ├── app.css             # 设计 token / 玻璃 / 动效 / reset
│   │   ├── app.html            # Live2D 库加载顺序
│   │   ├── config.js           # 后端地址 / 模型路径 / 应用常量
│   │   ├── routes/+page.svelte # 编排：socket / 音频 / 表情 / 面板 / 点击穿透
│   │   └── lib/
│   │       ├── components/     # Dock / ChatDrawer / Bubble / Settings / …
│   │       ├── live2d/         # Live2DRenderer.js（加载 / 布局 / 表情 / 命中）
│   │       ├── audio/          # AudioEngine / VoiceRecorder
│   │       ├── net/            # PetSocket（重连 / 心跳 / 协议）
│   │       ├── tauri/          # windowBridge（窗口能力安全封装）
│   │       ├── expressions.js  # 情绪 / look / exp3 清单
│   │       ├── settings.svelte.js
│   │       └── toast.svelte.js
│   ├── static/lib/             # pixi · index · live2d · live2dcubismcore
│   ├── static/live2d/
│   │   └── lilith_love/        # 角色模型（授权待确认，不提交）
│   └── src-tauri/              # Tauri 壳：透明窗口 + capability
│
├── tts/                        # (可选) GPT-SoVITS 本地 TTS
├── tools/
│   ├── start.sh / start.bat    # 一键启动
│   └── dev-mock/server.py      # 零依赖 Mock 后端（同协议 + /ping + emit）
├── docs/
│   ├── UI.md                   # 前端设计 / 渲染 / 点击穿透 / 自测
│   ├── ARCHITECTURE.md         # 模块、WebSocket 协议、数据目录
│   ├── ASSETS.md               # 素材与授权清单
│   ├── PRESENCE.md             # 关系状态机设计稿（未实现）
│   ├── TESTING.md              # 联调与自测
│   └── INCIDENTS.md            # 渲染排障记录与代码快照
├── data/                       # 运行时数据（自动生成，不提交）
└── README.md
```

---

## 🎨 模型现状（重要）

仓库使用 `frontend/app/static/live2d/lilith_love/`（Live2D Cubism 3，VTube Studio 导出）：

| 项目 | 实际情况 |
| :--- | :--- |
| `Motions` | 未定义，模型**没有任何动作** |
| `Expressions` | 未在 `model3.json` 声明；磁盘上有 8 个 `.exp3.json` |
| 前端处理 | **运行时探测并加载**这些 `.exp3.json`，不改模型文件；缺文件自动跳过 |
| 可用能力 | 参数 + 物理演算 + 呼吸 / 眨眼 + 参数化表情 + 口型 |
| 授权 | **待确认**，因此未提交进 git（`.gitignore` 已排除） |

因此：

- 情绪会**真实改变表情**（参数层 + 8 个表情文件），不再停留在后端；
- 模型本身没有 Motion，所以没有「挥手动画」之类的动作；戳一戳的弹跳是渲染层做的
  程序化 squash & stretch，不属于模型动作；
- 想让某个情绪使用别的表情，改 `src/lib/expressions.js` 的 `EMOTIONS` / `LOOK_PRESETS`
  即可，不需要动模型。

### 添加模型自带的 `.exp3.json`

1. 把文件放在模型目录；
2. 在 `src/lib/expressions.js` 的 `CUSTOM_EXPRESSIONS` 里加一条 `{ id, label, file }`；
3. 重新加载。文件不存在 / 参数在当前模型里不存在 / JSON 非法都会被忽略，不会报错白屏。

---

## ⚙️ 配置

### 后端 `backend/.env`

| 变量 | 说明 |
| :--- | :--- |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 主脑（OpenAI 兼容端点） |
| `SILICON_API_KEY` / `STT_MODEL` | 语音识别（可选） |
| `TTS_SERVICE_URL` / `TTS_TIMEOUT` | 本地 TTS 地址与超时 |
| `ENABLE_VISION` | 屏幕截图视觉，默认 `false` |
| `PET_NAME` | 角色称呼，注入角色卡 |
| `PERSONA_PATH` | 角色卡路径，默认 `personas/pet.txt` |
| `BOREDOM_THRESHOLD` / `BOREDOM_MAX` | 主动发言初始阈值 / 上限（秒） |
| `ALARM_ENABLED` / `ALARM_CHECK_INTERVAL` | 闹钟开关与检查间隔 |
| `LILITH_DATA_DIR` | 数据目录，默认项目根 `data/` |
| `HOST` / `PORT` | 监听地址与端口，默认 `127.0.0.1:8001` |

### 前端 `frontend/app/.env`

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `VITE_BACKEND_HTTP` | `http://127.0.0.1:8001` | 后端 HTTP 地址 |
| `VITE_BACKEND_WS` | 由 HTTP 推导 | WebSocket 地址 |
| `VITE_LIVE2D_MODEL_DIR` | `live2d/lilith_love` | 模型目录（相对 `static/`） |
| `VITE_LIVE2D_MODEL_FILE` | `<目录名>.model3.json` | 主文件名 |
| `VITE_PET_NAME` | `Lilith` | 界面称呼 |
| `VITE_PET_TITLE` | `女仆 · 桌面伴侣` | 副标题 |

界面里的构图 / 表演 / 窗口 / 声音设置都在设置面板中，持久化到 localStorage，不需要改 env。

---

## 🔄 更换角色

1. 模型放进 `frontend/app/static/live2d/<名字>/`，主文件名与目录名一致
2. 在 `frontend/app/.env` 设置 `VITE_LIVE2D_MODEL_DIR=live2d/<名字>`
3. 可选：在 `src/lib/expressions.js` 里登记该模型的 `.exp3.json`
4. 用设置面板的缩放 / 水平 / 垂直位置调整构图
5. 改 `backend/personas/pet.txt` 与 `PET_NAME` 调整性格

> ⚠️ 模型与角色形象必须自有，或授权明确允许使用。见 [docs/ASSETS.md](docs/ASSETS.md)。

---

## 🔌 接口

| 接口 | 说明 |
| :--- | :--- |
| `ws://127.0.0.1:8001/ws` | 对话、状态、音频 |
| `GET /api/current_emotion` | 当前情绪标签 |
| `GET /` · `GET /ping` | 健康检查 |
| `GET /api/dev/emit` | 调试：向在线窗口推送一条消息，无需 LLM |

协议细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，
前端设计与渲染链路见 [docs/UI.md](docs/UI.md)，
联调方法见 [docs/TESTING.md](docs/TESTING.md)，
渲染排障与历史快照见 [docs/INCIDENTS.md](docs/INCIDENTS.md)。

---

## 🧪 自测

```bash
cd frontend/app
npm run check        # svelte-check，0 error / 0 warning
npm run build        # SvelteKit 静态构建
cd src-tauri && cargo check   # Tauri 配置 / capability
```

视觉回归可以用 `tools/dev-mock` + 浏览器模式完成，详见 [docs/UI.md](docs/UI.md#8-自测清单)。

---

## 🔒 安全

- TTS 的 `/set_model`、`/control`、`/change_refer` 默认关闭，且不接受请求级参考音频路径（`TTS_ALLOW_ADMIN=1` 才开）。
- 权重加载使用 `weights_only=True`，避免 `.pth` 反序列化执行代码。
- 后端默认只监听 `127.0.0.1`。
- 桌宠不读取系统剪贴板、不上传本地文件；语音仅在你主动点麦克风时采集。
- 生产构建启用最小 CSP：`script-src 'self' 'wasm-unsafe-eval'`（Cubism Core 的 wasm 内联在
  JS 里）、`style-src 'self' 'unsafe-inline'`（Svelte 内联样式）、`img-src 'self' data: blob:`、
  `connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:8001 ws://127.0.0.1:8001`，
  并禁掉 `object-src` / `frame-src` / `base-uri` / `form-action`。
- `assetProtocol` 已关闭：全仓库没有 `convertFileSrc` / `asset://`，模型全部走同源相对路径，
  不再向 `$DOWNLOAD` / `$DESKTOP` / `$DOCUMENT` / `$PICTURE` / `$TEMP` 开放文件访问。
- 窗口权限只保留 `core:default` 之外真正需要的最小集合；`cursor-position` / `inner-position` /
  `outer-position` / `scale-factor` 由 `core:default` 提供，不再重复声明。
- CSP 只在**生产构建**由 Tauri 自定义协议注入，桌面 `tauri dev` 的页面来自 Vite，
  不受其约束（HMR 不受影响）。细节与维护注意事项见 [docs/TESTING.md](docs/TESTING.md#csp生产构建)。

---

## 🧭 设计稿

关系状态机（存在感与打扰的边界）见 [docs/PRESENCE.md](docs/PRESENCE.md)，尚未实现。

---

## 📄 许可

MIT（见 [frontend/app/LICENSE](frontend/app/LICENSE)）。第三方组件授权见 [docs/ASSETS.md](docs/ASSETS.md)。
