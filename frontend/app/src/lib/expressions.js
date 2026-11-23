/**
 * Expression system.
 *
 * Two independent layers are composed into every "look":
 *
 *  1. Procedural deltas on standard Cubism parameters (brows, eyes, mouth…).
 *     These work with any well-formed model.
 *  2. Optional `.exp3.json` files shipped next to a model. They are loaded by
 *     the renderer at runtime; missing files are ignored, never fatal.
 *
 * Values are additive deltas — the renderer applies them after motions,
 * breathing and physics, right before Cubism draws the frame.
 */

/** Extra expressions that may exist beside the model. */
export const CUSTOM_EXPRESSIONS = [
  { id: 'starry', label: '星星眼', file: '星星眼.exp3.json' },
  { id: 'blush', label: '脸红', file: '脸红.exp3.json' },
  { id: 'dark', label: '脸黑', file: '脸黑.exp3.json' },
  { id: 'dull', label: '高光消失', file: '高光消失.exp3.json' },
  { id: 'wave', label: '打招呼', file: '打招呼.exp3.json' },
  { id: 'cake', label: '草莓蛋糕', file: '召唤草莓蛋糕.exp3.json' },
  { id: 'armBehindR', label: '背手·右', file: '右放后.exp3.json' },
  { id: 'armBehindL', label: '背手·左', file: '左放后.exp3.json' },
];

/**
 * Core looks. `params` are additive deltas; `custom` maps custom-expression
 * ids to the weight they should be applied with.
 */
export const LOOK_PRESETS = {
  neutral: {
    label: '中性',
    params: {},
    custom: {},
  },
  smile: {
    label: '微笑',
    params: {
      ParamEyeLSmile: 0.72,
      ParamEyeRSmile: 0.72,
      ParamBrowLY: 0.18,
      ParamBrowRY: 0.18,
      ParamMouthForm: 0.5,
      ParamMouthOpenY: 0.04,
    },
    custom: { starry: 0.4 },
  },
  angry: {
    label: '生气',
    params: {
      ParamBrowLAngle: -0.55,
      ParamBrowRAngle: -0.55,
      ParamBrowLY: -0.28,
      ParamBrowRY: -0.28,
      ParamMouthForm: -0.5,
    },
    custom: { dark: 1 },
  },
  sad: {
    label: '难过',
    params: {
      ParamBrowLY: -0.36,
      ParamBrowRY: -0.36,
      ParamBrowLAngle: 0.48,
      ParamBrowRAngle: 0.48,
      ParamMouthForm: -0.36,
      ParamMouthOpenY: 0.02,
    },
    custom: { dull: 0.85 },
  },
  shy: {
    label: '害羞',
    params: {
      ParamEyeLSmile: 0.42,
      ParamEyeRSmile: 0.42,
      ParamBrowLY: -0.12,
      ParamBrowRY: -0.12,
      ParamMouthForm: 0.2,
    },
    custom: { blush: 1 },
  },
  surprise: {
    label: '惊讶',
    params: {
      ParamBrowLY: 0.58,
      ParamBrowRY: 0.58,
      ParamMouthOpenY: 0.24,
      ParamEyeLOpen: 0.06,
      ParamEyeROpen: 0.06,
    },
    custom: { starry: 0.35 },
  },
  sleepy: {
    label: '困倦',
    params: {
      ParamEyeLOpen: -0.5,
      ParamEyeROpen: -0.5,
      ParamBrowLY: -0.16,
      ParamBrowRY: -0.16,
      ParamMouthOpenY: 0.07,
    },
    custom: { dull: 0.45 },
  },
  daze: {
    label: '出神',
    params: {
      ParamBrowLY: 0.06,
      ParamBrowRY: 0.06,
      ParamEyeLSmile: 0.16,
      ParamEyeRSmile: 0.16,
      ParamMouthOpenY: 0.1,
    },
    custom: { dull: 0.22 },
  },
  fear: {
    label: '害怕',
    params: {
      ParamBrowLY: 0.55,
      ParamBrowRY: 0.55,
      ParamBrowLAngle: 0.45,
      ParamBrowRAngle: 0.45,
      ParamMouthForm: -0.24,
      ParamMouthOpenY: 0.12,
    },
    custom: { dull: 0.3 },
  },
  wronged: {
    label: '委屈',
    params: {
      ParamBrowLY: -0.46,
      ParamBrowRY: -0.46,
      ParamBrowLAngle: 0.5,
      ParamBrowRAngle: 0.5,
      ParamMouthForm: -0.3,
    },
    custom: { blush: 0.35 },
  },
  calm: {
    label: '平静',
    params: {
      ParamEyeLSmile: 0.18,
      ParamEyeRSmile: 0.18,
      ParamMouthForm: 0.1,
    },
    custom: {},
  },
  sleep: {
    label: '睡着',
    params: {
      ParamEyeLOpen: -1,
      ParamEyeROpen: -1,
      ParamBrowLY: -0.2,
      ParamBrowRY: -0.2,
      ParamMouthOpenY: 0.02,
    },
    custom: { dull: 1 },
  },
  wave: {
    label: '打招呼',
    params: {
      ParamEyeLSmile: 0.6,
      ParamEyeRSmile: 0.6,
      ParamMouthForm: 0.35,
    },
    custom: { wave: 1 },
  },
  show: {
    label: '展示',
    params: {
      ParamEyeLSmile: 0.5,
      ParamEyeRSmile: 0.5,
      ParamMouthForm: 0.3,
    },
    custom: { cake: 1 },
  },
};

/** Emotion tags emitted by the backend (and a few presentation-only ones). */
export const EMOTIONS = {
  neutral: { label: '平静', color: '#cfd6e6', look: { preset: 'neutral' } },
  smile: { label: '开心', color: '#ffd489', look: { preset: 'smile' } },
  angry: { label: '生气', color: '#ff8f8f', look: { preset: 'angry' } },
  embarrassed: { label: '害羞', color: '#ffa9c9', look: { preset: 'shy' } },
  calm: { label: '平静', color: '#9fd6c9', look: { preset: 'calm' } },
  daze: { label: '出神', color: '#b3bede', look: { preset: 'daze' } },
  fear: { label: '害怕', color: '#c4a6ff', look: { preset: 'fear' } },
  blink: { label: '眨眼', color: '#ffe08a', look: { preset: 'smile' } },
  sad: { label: '难过', color: '#8fb4ff', look: { preset: 'sad' } },
  sleepy: { label: '困倦', color: '#a9b9d0', look: { preset: 'sleepy' } },
  surprise: { label: '惊讶', color: '#ffc46b', look: { preset: 'surprise' } },
  wronged: { label: '委屈', color: '#d7a9ff', look: { preset: 'wronged' } },
  lie_down: {
    label: '趴下',
    color: '#a9b9d0',
    look: { preset: 'sleepy', params: { ParamBodyAngleZ: 1.2 } },
  },
  stand: { label: '起身', color: '#9fd6c9', look: { preset: 'neutral' } },
  sleep: { label: '睡着', color: '#8ea6d8', look: { preset: 'sleep' } },
  show: { label: '展示', color: '#ffd489', look: { preset: 'show' } },
  sit: {
    label: '坐下',
    color: '#9fd6c9',
    look: { preset: 'calm', params: { ParamBodyAngleZ: 0.8 } },
  },
  birthday: {
    label: '生日',
    color: '#ffb3d9',
    look: { preset: 'show', custom: { starry: 0.9 }, params: { ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3 } },
  },
};

export const DEFAULT_EMOTION = EMOTIONS.neutral;

export function getEmotion(id) {
  return (id && EMOTIONS[id]) || DEFAULT_EMOTION;
}

function mergeLook(target, extra = {}) {
  if (!extra) return target;
  if (extra.params) Object.assign(target.params, extra.params);
  if (extra.custom) Object.assign(target.custom, extra.custom);
  return target;
}

/** Turn an emotion id into a fully-resolved look object. */
export function emotionToLook(emotionId) {
  const emotion = getEmotion(emotionId);
  const preset = LOOK_PRESETS[emotion.look.preset] || LOOK_PRESETS.neutral;
  const look = {
    params: { ...preset.params },
    custom: { ...preset.custom },
  };
  return mergeLook(look, emotion.look);
}

/** Turn a manual shelf id (`preset:<name>` or `custom:<id>`) into a look. */
export function shelfIdToLook(shelfId) {
  if (!shelfId) return null;
  if (shelfId.startsWith('preset:')) {
    const preset = LOOK_PRESETS[shelfId.slice(7)];
    return preset ? { params: { ...preset.params }, custom: { ...preset.custom } } : null;
  }
  if (shelfId.startsWith('custom:')) {
    return { params: {}, custom: { [shelfId.slice(7)]: 1 } };
  }
  return null;
}

/** Options shown in the expression tray. Custom entries only appear if loaded. */
export function buildShelf(customExpressions = []) {
  const base = [
    ['preset:neutral', '中性'],
    ['preset:smile', '微笑'],
    ['preset:shy', '害羞'],
    ['preset:angry', '生气'],
    ['preset:sad', '难过'],
    ['preset:surprise', '惊讶'],
    ['preset:sleepy', '困倦'],
    ['preset:daze', '出神'],
  ].map(([id, label]) => ({ id, label, kind: 'preset', color: '#a9c9ff' }));

  const customs = customExpressions.map((expr) => ({
    id: `custom:${expr.id}`,
    label: expr.label,
    kind: 'custom',
    color: '#ffb3d1',
  }));

  return [...base, ...customs];
}

export function shelfLabel(shelfId, customExpressions = []) {
  if (!shelfId) return '自动';
  const options = buildShelf(customExpressions);
  return options.find((o) => o.id === shelfId)?.label || '自动';
}
