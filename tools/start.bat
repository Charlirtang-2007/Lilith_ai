@echo off
REM 一键启动（Windows）：后端 + 桌宠窗口
setlocal
set ROOT=%~dp0..

start "Lilith Backend" cmd /k "cd /d %ROOT%\backend && python main.py"
start "Lilith Pet" cmd /k "cd /d %ROOT%\frontend\app && (where bun >nul 2>nul && bun run tauri dev || npm run tauri dev)"

echo 后端: http://127.0.0.1:8000
echo 如需本地语音，请另开窗口运行: python tts\api.py -dr ref_audio\default.wav -dt "参考文本" -dl zh -d cpu -p 9880
endlocal
