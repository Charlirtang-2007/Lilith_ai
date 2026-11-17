# 桌宠窗口（Tauri + SvelteKit + Live2D）

只做一件事：把 Live2D 角色渲染成透明、置顶、可拖拽的桌面窗口，并和后端对话。

- `src/config.js`：后端地址、模型目录、情绪 → 动作映射
- `src/lib/renderer/Live2DRenderer.js`：Live2D 渲染（基于 pixi-live2d-display）
- `static/lib/`：Pixi / pixi-live2d-display / Cubism Core
- `static/live2d/<模型>/`：Live2D 模型，目录名即模型名

```bash
bun install
bun run tauri dev     # 开发
bun run tauri build   # 打包
```

渲染核心早期派生自 [Spive2D](https://github.com/lmmtrr/spive2d)（MIT），现已精简为 Live2D 单一渲染路径。
