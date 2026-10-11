@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\tmp" mkdir "runtime\tmp"
set "TEMP=%CD%\runtime\tmp"
set "TMP=%TEMP%"
if exist ".venv\Scripts\python.exe" goto install
py -3.12 -c "import sys; assert sys.version_info >= (3,12)" >nul 2>&1
if not errorlevel 1 (
  py -3.12 -m venv .venv
) else (
  python -c "import sys; assert sys.version_info >= (3,12)" >nul 2>&1
  if errorlevel 1 (
    echo Install 64-bit Python 3.12 or newer from python.org and enable PATH.
    exit /b 1
  )
  python -m venv .venv
)
if errorlevel 1 exit /b 1
:install
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 exit /b 1
if not exist ".env" copy /y ".env.example" ".env" >nul
echo Setup complete. Set GEMINI_API_KEY in .env, then run START_CHATBOT.bat.
echo Gemini needs internet and available quota. No LLM weights are bundled or downloaded.
exit /b 0
