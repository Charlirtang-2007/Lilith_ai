/**
 * 前端运行时配置（可用环境变量覆盖）
 * 默认值对应本地开发：后端跑在 127.0.0.1:8000
 */

const env = import.meta.env;

/** 后端 HTTP 地址，例如 http://127.0.0.1:8000 */
export const BACKEND_HTTP = env.VITE_BACKEND_HTTP || 'http://127.0.0.1:8000';

/** 后端 WebSocket 地址 */
export const BACKEND_WS =
  env.VITE_BACKEND_WS || BACKEND_HTTP.replace(/^http/, 'ws') + '/ws';

/** Live2D 模型目录（相对 static/），目录内放同名 *.model3.json */
export const LIVE2D_MODEL_DIR = env.VITE_LIVE2D_MODEL_DIR || 'live2d/character'; // 目录名即模型名

/** 整体缩放倍率（相对于自适应铺满） */
export const MODEL_SCALE = Number(env.VITE_MODEL_SCALE || 1);

/** 自动待机切换间隔（毫秒） */
export const IDLE_SWITCH_MS = Number(env.VITE_IDLE_SWITCH_MS || 300000);

/**
 * 情绪 -> Live2D 动作 映射
 * 值为动作名，取 *.model3.json 里 Motions 的某个组名（例如 "Happy" 或 "Happy,0"）。
 * 留空或找不到时回退到 idle。
 */
export const EMOTION_MOTIONS = {
  smile: ['Happy', 'Smile'],
  angry: ['Angry'],
  sad: ['Sad'],
  surprise: ['Surprised', 'Shock'],
  embarrassed: ['Shy', 'Embarrassed'],
  calm: ['Calm'],
  daze: ['Idle'],
  fear: ['Fear'],
  sleepy: ['Sleepy'],
  sleep: ['Sleep'],
  wronged: ['Sad'],
  neutral: ['Idle'],
};

/** 情绪 -> Live2D 表情 映射（取 Expressions 的名字），没有就留空 */
export const EMOTION_EXPRESSIONS = {
  smile: 'happy',
  angry: 'angry',
  sad: 'sad',
};
