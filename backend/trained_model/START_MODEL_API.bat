@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto use_python
py -3.12 -c "import sys; assert sys.version_info[:2] == (3, 12)" >nul 2>nul
if errorlevel 1 goto use_python
py -3.12 bootstrap.py start
exit /b %errorlevel%
:use_python
python bootstrap.py start
exit /b %errorlevel%
