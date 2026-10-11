@echo off
setlocal
cd /d "%~dp0"
.venv\Scripts\python.exe -m pytest -q tests --basetemp=runtime\pytest
exit /b %ERRORLEVEL%
