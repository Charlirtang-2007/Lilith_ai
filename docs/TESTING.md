# 联调与自测

## 1. 后端快速自测

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

另开终端：

```bash
# 健康检查
curl http://127.0.0.1:8001/            # {"status":"ok","pet":"..."}
curl http://127.0.0.1:8001/api/current_emotion

# 不需要 LLM 也能给桌宠窗口推一条消息（联调 / 拍视频时很好用）
curl -G http://127.0.0.1:8001/api/dev/emit \
     --data-urlencode "text=你好呀" --data-urlencode "emotion=smile"
# 返回 {"sent": true, "clients": 1} —— clients 是当前连接的桌宠窗口数
```

- 未配置 `LLM_API_KEY` 时，对话会返回占位文本，方便先跑通链路。
- 未启动 TTS 时，`audio_url` 为空，前端自动降级为纯文字 + 合成口型。
- 未配置 `EMBEDDING_MODEL_PATH` 时，长期记忆检索自动关闭，其他功能不受影响。

## 2. 前端构建自测

```bash
cd frontend/app
npm run check        # svelte-check：目标 0 error / 0 warning
npm run build        # SvelteKit 静态构建
cd src-tauri
cargo check          # Tauri 配置 / capabilities / Rust 壳
```

## 3. 无后端 UI 联调（推荐）

```bash
python tools/dev-mock/server.py
# 另开终端
cd frontend/app
VITE_BACKEND_HTTP=http://127.0.0.1:8765 npm run dev
```

浏览器打开 http://localhost:1420。Mock 实现了完整 WS 协议 + HTTP：

| 接口 | 说明 |
| :--- | :--- |
| `GET /ping` | `{"pong": true}`，前端据此显示延迟 |
| `GET /api/dev/emit?text=...&emotion=...` | 广播一条 `audio_chunk`（用于气泡 / 表情 / 闹钟 UI） |
| WS `/ws` | `text_input` 0.6s 后回一条随机回复；`audio_input` 回识别文本 |

Mock 会在回复后补发 `state_update idle`，和真实后端一致；**不要省略这一步**，
否则前端会一直停在「思考中」并显示打字指示器。

## 4. 浏览器目测清单

开 DevTools Console：

```js
// 开发模式可用：真实渲染器快照（含表情 / 口型 / 布局）
window.__lilithRenderer.getDebugState()
```

| 检查项 | 预期 |
| :--- | :--- |
| Console | 无 `Could not find Cubism` / `PIXI is not defined` |
| `document.querySelector('canvas.live2d-canvas')` | 存在，且 `style.opacity === '1'` |
| 画布像素 | 角色可见（可在 Canvas 上 `drawImage` 到 2D canvas 查 alpha） |
| 单击角色 | 模型弹跳 + 气泡随机反应；点透明区域无反应 |
| 双击角色 | 打开对话抽屉 |
| 右键角色 | 快捷菜单；Esc 关闭 |
| 滚轮在角色上 | 缩放变化，设置里的「角色缩放」同步 |
| 发送消息 | 立即出现用户气泡；0.6s 后思考指示器 → 回复 + 表情 |
| 对话框的表情按钮 | 表情栏出现，自动 chip 固定在左侧，横向可滚动 |
| 设置滑杆 | 缩放 / 位置 / 不透明度实时变化；重启后保留 |
| 设置 → 连接 | 延迟有数值；「重新连接」可杀掉后端后重连 |
| 长台词 | 气泡最多两行，出现「展开全文」，点击打开对话 |
| IME | 中文输入法候选框回车不会误发送 |

### 常用调试命令

```bash
# 推一条主动气泡（抽屉关闭时）
curl "http://127.0.0.1:8765/api/dev/emit?text=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("今天风很温柔"))')&emotion=calm"

# 检查 8001 后端可达性
curl -s http://127.0.0.1:8001/ping
```

## 5. Tauri 桌面环境清单

需要在有图形会话（X11 / Wayland）的机器上人工确认：

- [ ] 窗口透明、无边框、始终置顶
- [ ] 鼠标在透明区域时点击可穿透到桌面
- [ ] 鼠标移到角色 / dock / 抽屉时恢复可点击
- [ ] 鼠标移到 dock 上方时能点按钮（而不是穿透）
- [ ] 拖动角色可移动窗口
- [ ] 顶部把手可拖动；悬停出现关闭按钮
- [ ] 打开对话 / 设置 / 右键菜单时整窗可交互
- [ ] 关闭菜单 / 面板后恢复自动穿透
- [ ] 模型贴图不超过 GPU `MAX_TEXTURE_SIZE`；无 `WebGL context lost`
- [ ] 多显示器 / 125%、150% 缩放下命中位置准确
- [ ] `backdrop-filter`、`color-mix()` 在 WebKitGTK 上显示正常（否则文字 / 玻璃发灰）
- [ ] 生产构建（`npm run tauri build`）下角色贴图 / 模型 / TTS 语音都能加载（CSP 生效，见下）
- [ ] 生产构建下键盘 Tab 能看见冰蓝焦点环（旧 WebKitGTK 无 `:focus-visible` 时也不丢焦点）

> 若 Tauri 报权限错误，检查 `src-tauri/capabilities/default.json` 是否包含：
> `core:window:allow-set-focus`、`core:window:allow-set-ignore-cursor-events`、
> `core:window:allow-start-dragging`、`core:window:allow-set-size`、
> `core:window:allow-set-size-constraints`、`core:window:allow-close`、
> `core:window:allow-set-always-on-top`。
> `cursor-position` / `inner-position` / `outer-position` / `scale-factor` 已包含在
> `core:default` → `core:window:default` 中，不要再重复列出（2025-11 收敛）。

### CSP（生产构建）

`tauri.conf.json` 的 `app.security.csp` 只作用于**由 Tauri 协议提供 HTML 的生产构建**：

- `tauri dev`（桌面）时页面由 Vite 的 `http://localhost:1420` 直接提供，Tauri 不注入 CSP，
  因此 HMR / 内联脚本 / `eval` 类开发期行为不受影响；`devCsp` 也故意留空。
  （`devCsp` 只在移动端 dev 的 dev-server 代理路径下才会生效，本项目不发移动端。）
- 生产构建时 Tauri 在编译期扫描 `build/` 里的 HTML，为内联 `<script>` 计算 `sha256`、
  为带 nonce 占位符的标签注入随机 nonce，所以 `script-src 'self'` 不会挡住 SvelteKit 的引导脚本。
- Cubism Core 把 wasm 内联在 `live2dcubismcore.min.js` 里（`WebAssembly.instantiateStreaming`
  + base64），因此 `script-src` 需要 `'wasm-unsafe-eval'`；WebKitGTK ≥ 2.40 支持该关键字。
- TTS 音频是 `<audio>` 直接播 `http://127.0.0.1:8001/...`，所以 `media-src` 里带了这个源；
  如果改 `VITE_BACKEND_HTTP`，CSP 的 `connect-src` / `media-src` 也要同步改。
- Live2D 贴图 / 模型走同源相对路径（没有 `convertFileSrc`），`assetProtocol` 已关闭。

### WebKitGTK 旧缓存

从旧版前端升级后，`npm run tauri dev` 可能仍然请求已经删除的 `/src/global.css` 等文件，
控制台出现 404 或旧页面。这是 WebKit 的磁盘缓存，不是 Vite 的问题：

```bash
rm -rf ~/.local/share/cn.lilith.desktop-pet/WebKitCache
# 或者完全不碰现有缓存，用临时数据目录：
XDG_DATA_HOME=$PWD/.cache-dev \
XDG_CACHE_HOME=$PWD/.cache-dev \
  npm run tauri dev
```

（本会话的沙箱里 `~/.local/share/.../WebKitCache` 是只读的，所以验证时用的是临时
`XDG_DATA_HOME`；普通用户 shell 不受此限制。）

### 无显示环境（CI / 远程机器）

- 纯后端 + WS 协议可用 `fastapi.testclient` 或任意 WS 客户端测试。
- Tauri 窗口需要可用的图形环境（X11/Wayland + WebKitGTK）；无 GPU 时建议
  `LIBGL_ALWAYS_SOFTWARE=1`，否则 WebKit 可能停在软件渲染初始化阶段。
- 受限系统（`/run/user/$UID` 或 `~/.config` 不可写）会触发 Tauri 窗口状态插件报错；
  本项目未使用该插件。

## 6. 调试开关

| 环境变量 | 作用 |
| :--- | :--- |
| `LILITH_DEVTOOLS=1` | debug 构建启动时自动打开开发者工具 |
| `LILITH_EMIT='{"type":...}'` | 启动 3 秒后把该 JSON 作为 `backend-message` 事件推给窗口 |
| `TTS_ALLOW_ADMIN=1` | 打开 TTS 的 `/set_model`、`/control`、`/change_refer`（仅本机调试） |

前端还支持：

```js
// Console，开发模式
window.__lilithRenderer.getDebugState()
// { ready, fps, layout, base, currentParams, currentCustom, expressions, mouth }
```
