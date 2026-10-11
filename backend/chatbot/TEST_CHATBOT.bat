@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run SETUP_CHATBOT.bat first.
  exit /b 1
)
".venv\Scripts\python.exe" -m pytest -q tests --basetemp=runtime\pytest
if errorlevel 1 exit /b 1
".venv\Scripts\python.exe" verify_service.py --start
exit /b %ERRORLEVEL%
