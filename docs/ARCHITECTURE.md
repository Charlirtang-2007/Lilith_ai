# 架构说明

```
┌──────────────────────────────────────┐
│ frontend/app (Tauri + SvelteKit SPA) │
│                                      │
│  +page.svelte  ── 编排 / 状态 / 穿透 │
│   ├─ components/*      展示层        │
│   ├─ live2d/*          渲染层        │
│   ├─ audio/*           播放 / 录音   │
│   ├─ net/PetSocket     WS 客户端     │
│   └─ tauri/*           窗口能力封装  │
└───────────────┬──────────────────────┘
                │ ws://127.0.0.1:8001/ws
┌───────────────▼──────────────────────┐
│ backend (FastAPI)                    │
│ 对话主脑 / 记忆 / 闹钟 / 主动发言 / 截图 │
└───────────────┬──────────────────────┘
                │ HTTP POST /
┌───────────────▼──────────────────────┐
│ tts (GPT-SoVITS, 可选)               │
└──────────────────────────────────────┘
```

## 前端模块

| 文件 | 职责 |
| :--- | :--- |
| `routes/+page.svelte` | 唯一有业务编排的组件：WebSocket 事件、消息列表、气泡定时器、表情状态、点击穿透轮询、快捷键 |
| `routes/+layout.svelte` | 引入 `app.css`；全局透明 html/body |
| `app.html` | 固定 Live2D 依赖加载顺序：`pixi → live2d → live2dcubismcore → index` |
| `app.css` | 设计 token、玻璃表面、字体、滚动条、动效、reduced-motion |
| `config.js` | 环境变量、后端地址、模型目录 / 文件名、应用常量 |
| `lib/components/*` | 纯展示组件：`CharacterStage` `ChatDrawer` `MessageList` `Composer` `Dock` `SpeechBubble` `ExpressionShelf` `SettingsSheet` `ContextMenu` `TopChrome` `ToastHost` `Ambient` 等 |
| `lib/live2d/Live2DRenderer.js` | Pixi 应用、模型加载、底部锚定布局、表情 / 口型 / 待机层、alpha 命中测试、上下文丢失处理 |
| `lib/expressions.js` | 18 情绪 → look；内置参数化 look；模型 `.exp3.json` 清单；表情栏构建 |
| `lib/audio/AudioEngine.js` | 单个 `<audio>` + AnalyserNode；RMS 口型；合成波形回退；静音 / 音量 |
| `lib/audio/VoiceRecorder.js` | `MediaRecorder` 封装、mime 选择、base64 转换 |
| `lib/net/PetSocket.svelte.js` | WebSocket 连接、指数退避重连、`/ping` 延迟、DND / 打断 / 音频消息 |
| `lib/tauri/windowBridge.js` | `setIgnoreCursorEvents` / `startDragging` / `cursorPosition` / `outerPosition` / `scaleFactor` / close / focus 的防御式封装 |
| `lib/settings.svelte.js` | `$state` 设置对象 + `$effect.root` 防抖持久化 |
| `lib/toast.svelte.js` | toast 队列 |

## 渲染管线

1. **创建**：`Live2DRenderer` 在 `CharacterStage` 的 host 内创建 Pixi 6 Application，透明、
   `preserveDrawingBuffer: true`、`autoDensity`、分辨率跟随画质设置。
2. **加载**：`PIXI.live2d.Live2DModel.from(url)`。加载完成后缓存参数 ID / min / max，
   取出模型自带 `breath` / `eyeBlink` / `lipSyncIds`。
3. **布局**：模型放进 root container，底部锚定；`topInset=92` 给气泡和顶部 chrome，
   contain 缩放乘 zoom；zoom > 1 时头顶固定、脚部溢出窗口；zoom < 1 时在可用区居中。
4. **表情文件**：并行 fetch `CUSTOM_EXPRESSIONS` 里的 `.exp3.json`，只保留当前模型存在的参数；
   缺失 / 非法文件忽略。
5. **每帧**：内部模型在 `beforeModelUpdate` 事件前完成 motion / 呼吸 / 眨眼 / focus / 物理；
   渲染层在该事件里叠加：
   - 情绪参数（加法，120ms 指数淡入）
   - 表情文件参数（Add / Multiply / Overwrite + weight）
   - 口型（`AnalyserNode` RMS 或合成波形）
   - 极低频待机摇摆
   - 戳一戳的 squash & stretch
6. **绘制**：Cubism 原生 `coreModel.update()` 由 pixi-live2d-display 调用，Pixi ticker 渲染。
7. **隐藏**：`visibilitychange` 时停 ticker + `model.autoUpdate = false`，恢复时重启。

## 点击穿透

透明窗口的整块矩形默认会吞掉桌面点击。前端在 Tauri 下每 75ms：

1. `cursorPosition` 取系统鼠标物理坐标；`outerPosition` / `scaleFactor` 换算成窗口 CSS 坐标。
2. 检查 `[data-hit]` 元素矩形（dock / 抽屉 / 气泡 / 面板 / 菜单 / 顶部 chrome）。
3. 未命中 UI 时调用 `renderer.hitTest`：先做模型包围盒剔除，再对画布 `gl.readPixels` 读 alpha。
4. 命中 → `setIgnoreCursorEvents(false)`；离开 280ms → `true`；抽屉 / 设置 / 菜单打开时强制可交互。
5. 读取失败（权限 / 平台）→ 保持整窗可交互，保证功能可用。

## WebSocket 协议

前端 → 后端：

| type | payload |
| :--- | :--- |
| `text_input` | `{"text": "..."}` |
| `audio_input` | `{"audio_base64": "<webm>", "mime_type": "..."}` |
| `set_dnd_mode` | `{"enabled": true}` |
| `interrupt` | `{}` |

后端 → 前端：

| type | payload |
| :--- | :--- |
| `state_update` | `{"state": "thinking" \| "speaking" \| "idle"}` |
| `audio_chunk` | `{"text", "audio_url", "expression", "is_alarm"?}` |
| `system_message` | `{"text": "..."}` |
| `text_input` | 语音识别结果回显 |

前端行为：

- `state_update` 只更新脑状态；音频实际播放完成后再结束「正在说话」。
- `audio_chunk`：写入对话、切表情、显示气泡（抽屉关着时）、播放 TTS；无音频时用合成口型。
- `system_message`：写入系统气泡 + toast；含闹钟标记时用琥珀色。
- 重连成功后自动重发 `set_dnd_mode`，保持前后端勿扰状态一致。
- 心跳用 HTTP `GET /ping`（不占 WS 通道），失败只显示 `—`，不主动断开 WS。

## 情绪 → 表现

- 后端固定 18 种情绪（`backend/main.py::ALLOWED_EMOTIONS`），随 `audio_chunk.expression` 下发。
- 前端 `expressions.js` 将情绪映射到 `LOOK_PRESETS`（眉毛 / 眼睛 / 嘴 / 身体参数）+ 自定义表情文件；
- 120ms 指数混合，手动表情栏可覆盖，切回「自动」后恢复跟随情绪；
- 模型文件缺失某个参数 / `.exp3.json` 时，对应层自动跳过，其余层继续生效。

## 数据目录

所有运行时产物都在 `data/`（可用 `LILITH_DATA_DIR` 覆盖）：

```
data/
├── chroma/          # ChromaDB 向量库
├── user_facts.json  # 用户事实
├── alarms.json      # 闹钟
└── audio/           # TTS 临时音频（断开连接时清理）
```

前端仅在 localStorage 存 UI 设置（`lilith.v3.settings`），不写模型 / 对话数据。
