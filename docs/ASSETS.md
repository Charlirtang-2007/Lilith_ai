# 素材与授权说明（ASSETS）

> 这份文件把所有「非自研素材」列清楚，方便开源、二次分发、比赛提交时说明来源。
> 原则：**只收录授权明确允许再分发的素材**；拿不准的素材一律不进仓库，只在本地使用。

## 1. 渲染引擎

| 组件 | 位置 | 授权 |
| :--- | :--- | :--- |
| Live2D Cubism Core（`live2dcubismcore.min.js`） | `frontend/app/static/lib/` | Live2D Proprietary Software License。个人/小规模非营利发布免签约；**发布前请确认适用于你的发布形态**（见 https://www.live2d.com/en/sdk/license/ ） |
| pixi-live2d-display（`index.min.js`，打包名 `PIXI.live2d`） | `frontend/app/static/lib/` | MIT |
| PIXI.js（`pixi.min.js`） | `frontend/app/static/lib/` | MIT |

> 说明：项目早期使用 Spine Runtime，该运行时为 Esoteric Software 专有授权，**已在本次重构中完全移除**。

## 2. Live2D 模型（`frontend/app/static/live2d/character/`）

请只放入满足以下条件的模型：

- [ ] 作者授权 **允许二次分发 / 在开源项目中再发布**（例如 Live2D 官方免费样例、CC0、明确声明可商用或可再分发的原创模型）
- [ ] 记录：模型名 / 作者 / 来源链接 / 授权类型

推荐来源：

| 来源 | 说明 |
| :--- | :--- |
| Live2D 官方免费样例 | https://www.live2d.com/en/learn/sample/ （附带样例数据使用条款） |
| Live2D Official / Pixiv 创作者 | 需逐个确认授权，很多作者**只允许个人使用** |
| 自己用 Cubism Editor 制作 | 最稳妥：完全原创，授权写"本项目原创" |
| 游戏角色提取模型（如各类二次元手游） | ⚠️ **不建议**。属于游戏公司的美术资产，即使非盈利也通常超出"个人使用"范围，且与 Live2D 引擎条款叠加后风险更高 |

把模型放进 `static/live2d/character/` 后，目录名即模型名：
例如 `static/live2d/character/character.model3.json` → 默认即可加载。

## 3. 语音

| 组件 | 授权 |
| :--- | :--- |
| GPT-SoVITS（`tts/`） | MIT |
| 参考音频 + 微调权重 | ⚠️ **不进仓库**。参考音频必须是自有或已获授权的声音；不要用未授权声优音色做「音色克隆」 |

## 4. 字体 / 图标 / 其他

- 默认界面不依赖外部字体与图标包。
- 应用图标位于 `frontend/app/src-tauri/icons/`，发布前请替换为自有图标。
