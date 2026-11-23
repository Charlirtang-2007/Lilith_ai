#!/usr/bin/env bash
# 一键启动：后端(8001) + 前端(1420) + 可选 TTS(9880)
# 用法：./tools/start.sh [--with-tts]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_TTS=0
[[ "${1:-}" == "--with-tts" ]] && WITH_TTS=1

cleanup() {
  echo "🛑 正在停止所有服务..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "🚀 启动后端 (http://127.0.0.1:8001)..."
(
  cd "$ROOT/backend"
  [[ -d .venv ]] && source .venv/bin/activate
  exec python main.py
) &

echo "🎨 启动桌宠窗口..."
(
  cd "$ROOT/frontend/app"
  if command -v bun >/dev/null 2>&1; then
    exec bun run tauri dev
  else
    exec npm run tauri dev
  fi
) &

if [[ $WITH_TTS -eq 1 ]]; then
  echo "🔊 启动本地 TTS (http://127.0.0.1:9880)..."
  (
    cd "$ROOT/tts"
    [[ -d .venv ]] && source .venv/bin/activate
    exec python api.py -dr "ref_audio/default.wav" -dt "参考音频的文本" -dl "zh" -d cpu -p 9880
  ) &
fi

wait
