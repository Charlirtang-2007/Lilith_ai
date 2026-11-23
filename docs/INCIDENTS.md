# 排障与事故记录（INCIDENTS）

> 记录本项目在渲染链路上踩过的坑、误判过程与最终修复，以及对应的代码快照。
> 目的：同一个坑不踩第二次；对外交付时能自证"哪些问题修过、怎么验证的"。

---

## 一、快照记录

| 编号 | 标签 / 提交 | 内容 | 状态 |
| :--- | :--- | :--- | :--- |
| S1 | `82488ea` · tag `snapshot-20261117` | 重构：删除 Spine 与导出模块，前端改名 `frontend/app`，后端拆分 `game_loop.py` / `alarms.py`，新增 `docs/PRESENCE.md` | ✅ 已提交 |
| S2 | 工作区（未提交） | 联调修复：`app.html` 依赖顺序、画布挂载、纹理缩放、情绪映射清空、文档校正、`docs/TESTING.md`、`tools/dev-mock` | ⏳ 未提交 |
| S3 | 工作区（未提交） | 渲染排障修复：`onMount` 挂载、canvas `opacity`、渲染器异常不再吞掉 | ⏳ 未提交 |
| S4 | 工作区（未提交） | 前端 UI / 渲染层整体重构：新设计系统、16 个组件、参数化表情、`.exp3` 运行时加载、点击穿透、滚轮缩放、语音输入 | ✅ 已通过构建 / 视觉验证 |

> 工作区基线：`82488ea refactor: 重构为 Live2D 单一渲染路径并统一目录结构`
> 未纳入版本管理：`frontend/app/static/live2d/lilith_love/`（模型授权待确认）、`data/`、`.dev-build/`（本地构建缓存）

---

## 二、渲染链路故障时间线

一次白屏，实际由 **4 个独立缺陷串联**造成，修复时逐个才暴露下一个。

### 故障 1 · Live2D 依赖库根本没加载

| 项 | 内容 |
| :--- | :--- |
| 症状 | 页面白屏，控制台无 Live2D 相关输出 |
| 误判 | 一度怀疑模型路径、模型文件损坏 |
| 根因 | 重构时清理 `src/app.html` 里的 Tauri mock，把加载 `pixi.min.js` / `index.min.js` / `live2dcubismcore.min.js` 的 `<script>` 一起删掉了 |
| 修复 | 在 `app.html` 中重新引入三个脚本 |
| 教训 | 清理"看起来无关"的代码块前，先确认它承担了几个职责 |

### 故障 2 · 脚本顺序错误，库加载即抛错

| 项 | 内容 |
| :--- | :--- |
| 症状 | `Could not find Cubism 2 runtime. This plugin requires live2d.min.js` |
| 误判 | 以为只是缺 `live2d.min.js` 一个文件 |
| 根因 | `index.min.js` **在加载期**就有两处强校验：`if (!window.Live2D) throw` 与 `if (!window.Live2DCubismCore) throw`。原来的顺序把 `index.min.js` 放在两个 runtime 之前，第一个 `throw` 直接截断后续代码，`PIXI.live2d` 永远是 `undefined` |
| 修复 | 顺序改为 `pixi → live2d(Cubism 2) → live2dcubismcore(Cubism 4) → index`，并从 git 历史恢复 `live2d.min.js` |
| 教训 | 混合打包的第三方库，加载顺序属于接口契约，不能凭直觉排 |

### 故障 3 · 纹理尺寸超出 WebGL 上限

| 项 | 内容 |
| :--- | :--- |
| 症状 | `texImage: Requested size at this level is unsupported`、`generateMipmap: The texture's base level must be complete`，伴随 `WebGL context was lost` |
| 误判 | 先怀疑 Pixi 配置、再怀疑显卡驱动 |
| 根因 | 模型贴图实际为 **8192 × 16384**（63 MB），超过部分环境的 `MAX_TEXTURE_SIZE`，上传时上下文被丢弃 |
| 修复 | LANCZOS 等比缩至 **4096 × 8192**（9.5 MB），原图备份为 `texture_00.orig.png`；`model3.json` 未改动 |
| 教训 | 判断贴图问题先读 PNG 头拿尺寸，不要靠猜 |

### 故障 4 · 画布在内存里，但从未进入 DOM

这是最隐蔽的一个，**单独修第 3 条后仍然看不见角色**。

| 项 | 内容 |
| :--- | :--- |
| 症状 | 控制台显示 `✅ Live2D 模型加载成功`，但 `document.querySelector('canvas')` 返回 `null`，页面只有聊天气泡 |
| 误判 | 先判成 `canvas` 的 `opacity: 0` 没恢复（确实也是缺陷，见故障 5），修完仍不可见 |
| 根因 | 初始化挂在 `DOMContentLoaded` 上，而 Svelte 的 `bind:this={canvasContainer}` 要等组件挂载后才赋值。此时 `canvasContainer` 为 `undefined`，`if (canvasContainer) appendChild(canvas)` **静默跳过**，画布只存在于内存 |
| 修复 | 改用 `onMount`；`canvasContainer` 为空时显式报错而非静默跳过；聊天通道提前到模型加载之前启动 |
| 教训 | "加载成功"只证明对象构造成功，**不证明它进入了渲染树**。带守卫的挂载语句必须能报错 |

### 故障 5 · 画布 `opacity: 0` 从未恢复

| 项 | 内容 |
| :--- | :--- |
| 症状 | canvas 存在、渲染正常，但完全透明 |
| 根因 | `PixiAppManager.acquire()` 创建 canvas 时设 `opacity: '0'`（用于隐藏未就绪画布），加载模型时只恢复了 `display: 'block'`，没有恢复 `opacity` |
| 修复 | `Live2DRenderer.load()` 中补 `this.#canvas.style.opacity = '1'` |
| 教训 | "设成 0 的地方"和"恢复的地方"必须成对出现，且要能被检索到 |

---

## 三、伴随缺陷（被发现并修复，但不直接导致白屏）

| # | 缺陷 | 影响 | 修复 |
| :-- | :--- | :--- | :--- |
| 1 | `Live2DRenderer.load()` 的 `catch` 吞掉异常 | 上层照打"✅ 加载成功"，把故障 2/3 藏了一轮 | `catch` 末尾 `throw err`，失败可见 |
| 2 | 浏览器里调用 `listen('backend-message')` | `__TAURI_INTERNALS__ is undefined`，未捕获异常 | 用 `IS_TAURI` 判断后再监听 |
| 3 | `EMOTION_MOTIONS` 写入不存在的动作名 | 情绪映射空转，且日志误导 | 清空为 `{}`，删掉编造的 `EMOTION_EXPRESSIONS` |
| 4 | 假待机定时器 `setAnimation('Idle')` | 模型无动作，纯空转 | 删除该定时器与配置项 |
| 5 | 文档声明了不存在的功能 | 误导使用者（F2 语音、18 情绪映射、`character` 默认目录） | README 改为「可用 / 仅后端 / 未接通」三态描述 |

---

## 四、为什么连续修错四轮

| 问题 | 具体表现 | 对策 |
| :--- | :--- | :--- |
| 单点思维 | 每次只修"当前报错",没检查同一链路上还有几个独立缺陷 | 修之前先列"要看见画面必须满足的全部条件"，逐条核对 |
| 把日志当结论 | `✅ 加载成功` 就宣布修好，实际画布不在 DOM | 只认可观测结果：canvas 在 DOM、`opacity=1`、像素非空 |
| 未验证就交付 | 无显示环境无法肉眼确认，却仍按"已完成"汇报 | 明确区分"我验证过的"与"需要你验证的" |
| 过度改动 | 把 `onMount` 换成 `DOMContentLoaded`，为的是避开一个加载阻塞问题，却引入新故障 | 最小改动：解耦用 Promise/顺序调整，不更换框架钩子 |

---

## 五、渲染问题排查清单（以后照这个走）

改任何渲染相关代码后，按顺序确认：

1. `static/lib/` 三个依赖是否都被 `<script>` 引入，且顺序为 `pixi → live2d → live2dcubismcore → index`
2. 控制台无 `Could not find Cubism` / `PIXI is not defined`
3. `document.querySelector('canvas')` **不为 null**（画布在 DOM 里）
4. `document.querySelector('canvas').style.opacity === '1'`
5. 无 `texImage: Requested size ... unsupported`（贴图尺寸 ≤ `MAX_TEXTURE_SIZE`）
6. 无 `WebGL context was lost`
7. 模型日志为真实成功（异常不再被 `catch` 吞掉）
8. 画面：角色可见、可缩放、鼠标跟随正常

任一条不满足，先修该条，不要跳到下一步。

---

## 六、环境相关信息

| 项 | 内容 |
| :--- | :--- |
| 复现环境 | Firefox，`http://localhost:1420`（Vite dev） |
| 渲染后端 | PixiJS 6.5.10 / WebGL 2 |
| Live2D | Cubism Core 5.0.0，`live2d.min.js` 2.1.00（仅满足加载期校验，不参与渲染） |
| 模型 | Cubism 3，`lilith_love.model3.json`，6751×12000；无 Motions；8 个 `.exp3.json` 由前端运行时加载 |
| 已知噪音 | `An AudioContext was prevented from starting automatically` 属浏览器自动播放策略，非故障 |
| 无 GUI 环境 | WebKitGTK 缺少 `/dev/dri` 时窗口创建成功但页面不加载，需在有图形界面的机器上验证 |


---

## 七、UI / 渲染层重构（S4）

### 重构前的实际问题

旧前端不是"样式不好看"这么简单，而是几个结构性问题叠在一起：

| 问题 | 后果 |
| :--- | :--- |
| 画布尺寸、模型缩放、窗口尺寸分散在 3 个地方 | 换窗口尺寸 / 缩放就错位，模型可能被裁头或贴边 |
| 情绪只做"动作名映射"，模型没有 Motions | 情绪永远不显示，代码还留着一堆空转分支 |
| 表情文件在磁盘上但 `model3.json` 没声明 | `pixi-live2d-display` 的 ExpressionManager 看不到它们，等于不存在 |
| 鼠标穿透靠 DOM `mouseenter` + 反向 `setIgnoreCursorEvents` | 一旦穿透，就收不到 `mouseenter`，dock 和气泡可能永久点不到 |
| 聊天 / 气泡 / 设置都挤在 +page.svelte | 状态互相污染，改一个地方牵动全部 |
| 点击用整窗矩形 | 透明区域也接收点击，桌面上"点不到背后的东西" |

### 这轮怎么改

1. **单一渲染器**：`lib/live2d/Live2DRenderer.js` 负责画布、模型、布局、表情、口型、命中；
   组件只传设置，不碰 Pixi。
2. **布局与模型解耦**：底部锚定 + 顶部 92px 安全区；zoom > 1 时头顶固定、脚部溢出；
   zoom < 1 时居中。窗口尺寸变化只重排，不重载。
3. **表情层**：在 `beforeModelUpdate` 钩子里叠加参数化 look + `.exp3` 文件参数 + 口型 + 待机摇摆；
   不再依赖 `Motions`，也不修改模型文件。
4. **点击穿透**：75ms 轮询系统光标 → 先查 `[data-hit]` UI 矩形 → 再查 Live2D alpha 像素；
   离开 280ms 才恢复穿透；权限失败降级为整窗可点。
5. **UI 分层**：`+page.svelte` 只做编排；dock / 抽屉 / 气泡 / 设置 / 表情 / 菜单 / toast
   各自独立，全部走同一套 glass token。
6. **长文本**：气泡最多两行 + 「展开全文」，避免盖住角色的脸。

### 验证证据（本机、Chromium Headless + SwiftShader）

- `npm run check`：0 error / 0 warning
- `npm run build`：通过
- `cargo check`：通过（配置 / capability 生效）
- 画布在 DOM、`opacity=1`、非空像素包围盒约 `52–372 × 104–700`（420×720）
- 单击角色 → 气泡随机反应 + `__lilithRenderer.getDebugState().currentCustom.blush ≈ 1`
- 自定义表情「脸红」实际写入了 `ParamCheek`；切回「自动」后 look 恢复为情绪对应参数
- 长台词收为两行，展开后进入对话，全量文本完整
- 缩放 1.18× 后头顶仍在 `y≈92`，脚部溢出窗口，不切头
- dock 未读角标在打开对话后归零
- 仅剩 WebGL `readPixels` 的性能提示，属于已知的 alpha 命中成本
- WebKitGTK 2.54 + Niri 实际窗口验证：角色、玻璃面板、滑杆、设置页均正常渲染；
  控制台无应用级错误（系统 GTK 主题/`/run/user` 只读噪声除外）
- Tauri capability / config 通过 `cargo check`；窗口在 Niri 下默认按列宽铺开，
  已在 `docs/UI.md` 给出 floating + 420×720 的窗口规则

### 新的坑（写下来）

| 坑 | 结论 |
| :--- | :--- |
| 用 `renderer.extract.pixels(model)` 做命中 | 模型 6751×12000，会把显存和 CPU 打爆；改用 1×1 `readPixels` + 包围盒剔除 |
| `readPixels` 不生效 | 必须 `preserveDrawingBuffer: true`；坐标要按物理像素、Y 轴翻转 |
| Tauri 的 `setIgnoreCursorEvents` 与 DOM hover 互斥 | 穿透后 DOM 收不到事件，必须用系统光标轮询，不能依赖 `mouseenter` |
| 把 `quality` 变化写在通用 `applySettings()` 里 | 拖缩放滑杆时每帧重建 render target，卡顿；必须拆分 effect |
| Mock 后端只发 `audio_chunk` 不发 `idle` | 前端会一直"思考中"并显示打字指示器；协议要完整 |
| `color-mix()` / `backdrop-filter` | Chromium 与 WebKitGTK 2.54 均正常 |
| 升级后 WebKit 仍加载旧 `global.css` | WebKit 磁盘缓存；清 `~/.local/share/cn.lilith.desktop-pet/WebKitCache` 或用临时 `XDG_DATA_HOME` |
| Niri 下窗口被铺成列宽 | Wayland 由合成器决定；加 `lilith-pet` 的 floating + 固定尺寸窗口规则 |
| 浅色壁纸下顶栏发灰 | 透明玻璃在浅色背景上对比不足；提高 chrome 基础不透明度并加深文字 |
