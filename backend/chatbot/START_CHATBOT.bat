@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run SETUP_CHATBOT.bat first.
  exit /b 1
)
".venv\Scripts\python.exe" -m chatbot.main
exit /b %ERRORLEVEL%
