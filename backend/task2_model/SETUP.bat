@echo off
setlocal
cd /d "%~dp0"
if not exist runtime\tmp mkdir runtime\tmp
set "TEMP=%CD%\runtime\tmp"
set "TMP=%TEMP%"
if not exist .venv\Scripts\python.exe (
  py -3.12 -m venv .venv 2>nul
  if errorlevel 1 python -m venv .venv
  if errorlevel 1 exit /b 1
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
exit /b %ERRORLEVEL%
