@echo off
echo 보고서 변환기 시작 중...

:: Ollama 기존 프로세스 종료
taskkill /f /im ollama.exe >nul 2>&1
timeout /t 2 >nul

:: Ollama 모델 경로 설정 후 실행
set OLLAMA_MODELS=C:\ollama_models
start "" /min "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve

:: 3초 대기
timeout /t 4 >nul

:: 웹서버 실행
cd /d "%~dp0"
echo 웹서버 실행 중... (http://localhost:3000)
node server.js
