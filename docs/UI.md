# 前端 UI 设计说明

> 目标：把「桌宠」做成一个安静、可信、可长期挂在桌面上的角色界面，而不是一张网页。
> 交互参照成熟桌面宠物 / Live2D 查看器（Live2DViewerEX、VTube Studio、Desktop Mate 等）
> 的通用做法：角色即界面、底部指挥坞、悬浮台词、抽屉式对话、参数化表情。
> 所有视觉与代码均为本项目原创，没有复制这些产品的素材或代码。

---

## 1. 设计原则

| 原则 | 落地 |
| :--- | :--- |
| 角色优先 | 窗口透明，角色占据全屏；无操作时只保留角色、地面辉光与一枚克制的底栏 |
| 安静 | 无边框、无标题栏、无滚动条；只在需要时出现气泡 / 抽屉 / 面板 |
| 可读 | 深色玻璃 + 冰蓝强调色，正文对比度按 WCAG AA 设计；中文优先字体栈 |
| 可预期 | 全局面板同一套圆角、描边、阴影、过渡曲线；按钮有 hover / active / disabled / focus-visible 四态 |
| 可降级 | WebGL 失败、后端离线、语音不可用、自动播放被拦截都有明确 UI，不白屏、不静默失败 |
| 可省电 | 窗口隐藏时停止渲染；可关呼吸 / 漂浮微光 / 减少动效 |

---

## 2. 窗口分区

```
┌──────────────────────────────────────────┐
│                 ⠿ 拖动把手               │  ← 顶部 chrome（悬停显示关闭）
│                                          │
│              ┌──────────────┐            │
│              │  台词气泡     │            │  ← 只在抽屉关闭时出现
│              └──────┬───────┘            │
│                     ▼                    │
│              ╭────────────╮              │
│              │  Live2D     │              │
│              │  character  │              │  ← 底部锚定、可缩放 / 偏移
│              ╰────────────╯              │
│           （地面辉光 + 微光）             │
│  ┌────────────────────────────────────┐  │
│  │ L  Lilith · 待机中   💬 ✨ ☾ ⚙     │  │  ← 指挥坞（始终可点）
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- **顶部 chrome**：极窄玻璃条，拖动窗口；悬停时出现关闭按钮。
- **台词气泡**：玻璃卡片 + 情绪 chip + 重播。长文本收为两行，提供「展开全文」直达对话。
- **指挥坞**：角色状态、未读角标、对话、表情、免打扰、设置。底部不遮挡脸，只压住裙摆 / 脚部。
- **对话抽屉**：从底部升起，高度 50%（上限 420px），消息底部对齐；表情面板可作为内联行展开。
- **设置面板**：全窗口玻璃 sheet，三个页签：形象 / 互动 / 连接。
- **右键菜单**：角色快捷操作，指针不会离开角色就完成常用动作。

---

## 3. 鼠标行为

| 操作 | 行为 |
| :--- | :--- |
| 左键单击角色 | 戳一戳：模型轻微弹跳 + 害羞表情 + 一句随机反应 |
| 左键拖动角色 | 原生拖动窗口（Tauri `startDragging`） |
| 双击角色 | 打开对话 |
| 右键角色 | 打开快捷菜单 |
| 滚轮在角色上 | 缩放角色（0.6×–1.8×，写入本地设置） |
| 滚轮在面板内 | 正常滚动面板内容，不缩放角色 |
| `Ctrl/Cmd + K` | 打开对话并聚焦输入框 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `Esc` | 依次关闭：菜单 → 设置 → 表情 → 对话 |
| `Enter` | 发送；中文输入法组合中不会误发；她正在说话时会先停掉语音 |
| `Shift + Enter` | 换行 |
| 输入框右侧按钮 | 空闲时发送；思考 / 说话时变为停止按钮 |

### 点击穿透（Tauri）

透明窗口默认会拦截整块矩形区域的鼠标。实现方式：

1. 每 75ms 通过 Tauri `cursorPosition` 读取系统鼠标位置，换算成窗口 CSS 坐标；
2. 先判断是否落在 `[data-hit]` 的可交互 UI 矩形内（dock、抽屉、气泡、面板……）；
3. 再用 Live2D 画布做 **alpha 命中测试**：`gl.readPixels` 读取鼠标处像素透明度，跟随角色真实轮廓；
4. 命中角色或 UI → `setIgnoreCursorEvents(false)`；离开 280ms → `true`。
5. 抽屉 / 设置 / 右键菜单打开时强制可交互；关闭后恢复自动穿透。
6. 读不到光标位置（权限缺失 / 平台限制）时降级为「整窗可点」，保证可用性而不是变成死窗口。

> 命中测试前先做模型包围盒剔除，只有鼠标接近角色时才触发 GPU `readPixels`，避免桌面移动时持续 GPU 同步。

---

## 4. Live2D 渲染层

```
Live2DModel.update()
  ├─ motionManager（当前模型 0 个动作，接口保留）
  ├─ focusController / 呼吸 / 眨眼 / 物理 / pose
  └─ emit('beforeModelUpdate')
        └─ renderer.applyFrame()
             1. 渐入情绪参数（眉毛 / 眼睛 / 嘴 / 身体角度）
             2. 叠加 .exp3 表情参数（Add / Multiply / Overwrite）
             3. 口型 ParamMouthOpenY（音频 RMS 或合成备用波形）
             4. 极低频待机摇摆（ParamBodyAngleX/Z、ParamAngleZ）
             5. 戳一戳的 squash & stretch
  └─ coreModel.update() → draw
```

- **布局**：底部锚定。窗口高度 - 顶部 92px（留给气泡和 chrome） - 底部 8px 参与 contain；
  - 缩放 ≤ 1 时在可用区里居中（脚底不悬空太多）；
  - 缩放 > 1 时头顶固定、脚部向下溢出窗口（不会切头），符合「镜头推近」直觉。
- **DPR**：自动 = `min(devicePixelRatio, 2)`；标准 1×；高清 ≥2×。切换画质只重建 render target，不重载模型。
- **命中**：`preserveDrawingBuffer: true` + 1×1 `readPixels`；WebGL 不可用时退化为模型包围盒。
- **上下文丢失**：提示并尝试恢复，不静默白屏。
- **隐藏窗口**：停止 Pixi ticker 与模型 autoUpdate，恢复可见时继续。

### 表情系统

模型没有 `Motions`，但磁盘上有 8 个 `.exp3.json`。新渲染层在加载时按 `CUSTOM_EXPRESSIONS`
清单逐个探测并解析，**不修改 `model3.json`**；缺文件直接跳过。随后：

- **参数层**（所有模型通用）：`ParamBrowLY/RY`、`ParamEyeLSmile/RSmile`、`ParamMouthForm`、
  `ParamMouthOpenY`、`ParamCheek` 等做加法增量；
- **文件层**（模型专属）：如「星星眼 / 脸红 / 脸黑 / 高光消失 / 招手 / 草莓蛋糕 / 背手」；
- 两层合成为 18 个后端情绪对应的「look」，带 120ms 指数淡入淡出；
- 手动表情从底部表情栏选择，保持到切回「自动」；
- 通过 `core.addParameterValueById` / `setParameterValueById` 的 weight 参数混入，和 Cubism 原生
  ExpressionManager 的混合语义一致。

### 口型

- TTS 通过同一个 `<audio>` 元素播放，`AnalyserNode` 取 RMS → `ParamMouthOpenY`；
- CORS / 自动播放 / WebKit 限制导致取不到波形时，回退到低频合成波形；
- 无音频 / 静音时也能做出「在说话」的嘴型；`lipSync` 可在设置中关闭。

---

## 5. 视觉系统

| Token | 值 / 用途 |
| :--- | :--- |
| `--ice` | `#a9c9ff`，角色发色延伸出的主强调色 |
| `--rose` | `#ffb3d1`，害羞、未读、自定义表情 |
| `--amber` | `#ffd479`，闹钟、免打扰、警告 |
| `--glass` | `rgba(12,16,27,.76)` + 18px backdrop blur |
| 圆角 | 24（面板）/ 20（dock）/ 16（气泡）/ 13（输入框） |
| 动效 | 140 / 220 / 360ms，`cubic-bezier(.22,.8,.28,1)` |
| 纹理 | 3.5% 透明 feTurbulence noise，只叠在玻璃面板上 |

- 不使用外部字体 / 图标包；图标为 24px 手写 stroke SVG。
- 支持 `prefers-reduced-motion` 与设置里的「减少动效」。
- 浏览器预览会显示一层夜色调背景 + 细点阵，方便开发截图；Tauri 下完全透明。

### 命中区与状态

- 图标按钮的**视觉尺寸保持原样**（18–22px），命中区用 `::after` 伪元素向四周各扩 3–5px，
  统一到 **≥28px**（SpeechBubble / ExpressionShelf / Composer / SettingsSheet / TopChrome）。
  伪元素不参与布局，所以不会撑开面板；外扩量都控制在面板 padding 之内，不会压到相邻元素。
- 交互态统一为 hover / active / disabled / `:focus-visible` 四态；active 用 `scale(.92~.97)`
  或加深底色，过渡统一走 `--dur-fast`（140ms）。
- 全局焦点环：`:focus` 默认画 `2px solid var(--ice)`，`:focus:not(:focus-visible)` 对指针焦点清除，
  并在 `@supports not selector(:focus-visible)` 时保留裸 `:focus` 环 —— 旧 WebKitGTK 也不会丢失键盘焦点。
- 情绪 chip 的 `color-mix()` 前先写一条 `rgba(255,255,255,.10)` / `.16` 兜底，
  不支持 `color-mix()` 的 WebKitGTK 只会显示中性灰，而不是整条声明被丢弃。

---

## 6. 本地持久化

`lilith.v3.settings`（localStorage）：

| 字段 | 默认 | 说明 |
| :--- | :--- | :--- |
| `zoom` / `offsetX` / `offsetY` | 1 / 0 / 0 | 构图 |
| `opacity` | 1 | 角色不透明度（不影响 UI） |
| `quality` | auto | 渲染分辨率 |
| `breath` / `blink` / `mouseTracking` / `lipSync` | true | 角色表演 |
| `autoEmotion` | true | 回复情绪 → 表情 |
| `showSparkles` / `ambientGlow` | true | 氛围层 |
| `alwaysOnTop` / `autoClickThrough` | true | 窗口 |
| `reduceMotion` | false | 减少动效 |
| `volume` / `muted` | 0.85 / false | 声音 |
| `dnd` | false | 免打扰（重连时自动同步后端） |
| `bubbleSeconds` | 10 | 气泡停留 |

设置变化会 debounce 180ms 写入；模型加载状态、对话记录不持久化（对话仅在本次运行内保留）。

---

## 7. 文件地图

```
src/
├── app.css                    设计 token / 玻璃 / 动效 / reset
├── app.html                   Live2D 脚本顺序（pixi → live2d → cubismcore → index）
├── config.js                  env、模型路径、应用常量
├── routes/+page.svelte        编排：socket / 音频 / 表情 / 面板 / 点击穿透
└── lib/
    ├── expressions.js          18 情绪、内置 look、exp3 清单、表情栏构建
    ├── settings.svelte.js      持久化设置（$state + $effect.root）
    ├── toast.svelte.js         轻量 toast 队列
    ├── live2d/Live2DRenderer.js 模型加载、布局、表情层、口型、alpha 命中
    ├── audio/AudioEngine.js    TTS 播放 + 波形 + 合成口型回退
    ├── audio/VoiceRecorder.js  MediaRecorder 录音
    ├── net/PetSocket.svelte.js WebSocket + 指数退避 + /ping 延迟
    ├── tauri/windowBridge.js   Tauri 窗口能力的安全封装
    └── components/*            16 个无业务依赖的展示组件
```

---

## 8. 自测清单

- [x] `npm run check` 0 error / 0 warning
- [x] `npm run build` 通过
- [x] `cargo check` 通过（Tauri 配置 / capability 生效）
- [x] 画布在 DOM 内，`opacity=1`
- [x] 画布非空像素包围盒覆盖角色（420×720 下约 52–372 × 104–700）
- [x] 单击角色只改变气泡与表情，不会误触 UI
- [x] 表情参数在 `beforeModelUpdate` 层实际写入（`__lilithRenderer.getDebugState()`）
- [x] 长台词收为两行，可「展开全文」进入对话
- [x] 抽屉消息底部对齐；输入框 IME 安全
- [x] 设置滑杆 / 开关 / 画质 / 重置 / 复制地址
- [x] 表情栏打开时自动滚到当前手动表情，标题显示「手动 · 脸红」
- [x] 后端断线 → 离线条 + 自动重连 + 延迟恢复
- [x] 控制台无应用级异常（仅 WebGL readPixels 性能提示）
- [x] WebKitGTK 2.54 + Niri 下实际渲染角色 / 设置面板（无应用级错误）
- [ ] 真实桌面环境下的点击穿透 / 原生拖动（当前环境无法注入 Wayland 指针，需人工验证）
- [x] 浅色壁纸下顶栏 / dock / 气泡对比度（Tauri 截图确认）


---

## 9. Wayland / 平铺合成器

Tauri 在 X11 / 多数 Wayland 合成器下会按 `tauri.conf.json` 的 300×520 创建窗口；
但**平铺合成器**（Niri、Hyprland、sway 等的滚动布局）默认会把新窗口按列宽铺开，
并给窗口画背景/边框——这会让「透明无边框」失效，看起来是「一整个窗口块」。

想让透明窗口生效、只看到角色，给合成器加一条窗口规则即可。**关键项是
`draw-border-with-background false`**：不平铺 + 不画背景，透明才能透出来。

Niri 26.04 已验证的规则（追加到 `~/.config/niri/rules.kdl`）：

```kdl
window-rule {
    match app-id=r"(?i)^lilith-pet$"
    open-floating true
    open-focused false
    draw-border-with-background false
    default-column-width { fixed 300; }
    default-window-height { fixed 520; }
    default-floating-position x=24 y=24 relative-to="bottom-right"
}
```

- `app-id` 在部分启动方式下是 `Lilith-pet`，所以用大小写不敏感正则。
- `draw-border-with-background false`：去掉合成器画的窗口背景/边框，透明才生效（缺了会看到深色窗口块）。
- `default-floating-position` 可改成你习惯的屏幕角落；`bottom-right` 是贴右下角。
- 改完执行 `niri msg action reload-config`（或重开桌宠）。
- 规则只影响合成器怎么摆窗口，不改变前端逻辑与按钮行为。
