@echo off
setlocal EnableDelayedExpansion
rem ---------------------------------------------------------------------------
rem  AeroMatrix: starts the trained model service and the web app.
rem    1. Model API  (backend\trained_model)  http://127.0.0.1:8000
rem    2. Web app    (Vite dev server)        http://localhost:5173
rem    3. Landing    (landing\, TanStack)      http://localhost:3000  ("Explore the System" opens the web app)
rem    4. AeroSage   (backend\chatbot)         http://127.0.0.1:8010  (assistant API; LLM key only in backend\chatbot\.env)
rem    5. Task 2     (backend\task2_model)     http://127.0.0.1:8030  (missing sensors / unseen locations; localhost only)
rem  First run needs internet to install Python and Node packages; later runs are offline.
rem  Never retrains the models. Closes nothing else that is running.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
set "ROOT=%CD%"
set "MODEL_DIR=%ROOT%\backend\trained_model"
if "%AEROMATRIX_PORT%"=="" set "AEROMATRIX_PORT=8000"

rem --- Find 64-bit Python 3.12 (the version the models were serialized with) ---
set "PY312="
if defined AEROMATRIX_PYTHON if exist "%AEROMATRIX_PYTHON%" set "PY312=%AEROMATRIX_PYTHON%"
if not defined PY312 (
  for /f "delims=" %%P in ('py -3.12 -c "import sys; print(sys.executable)" 2^>nul') do set "PY312=%%P"
)
if not defined PY312 (
  for /d %%D in ("%APPDATA%\uv\python\cpython-3.12*") do if exist "%%D\python.exe" set "PY312=%%D\python.exe"
)
if not defined PY312 (
  for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python312") do if exist "%%D\python.exe" set "PY312=%%D\python.exe"
)
if not defined PY312 (
  for /f "delims=" %%P in ('python -c "import sys; sys.version_info[:2]==(3,12) and print(sys.executable)" 2^>nul') do set "PY312=%%P"
)
if not defined PY312 (
  echo [AeroMatrix] Python 3.12 64-bit was not found.
  echo             Install it from python.org, or set AEROMATRIX_PYTHON to its python.exe, then run this again.
  pause
  exit /b 1
)
echo [AeroMatrix] Using Python: %PY312%
echo [AeroMatrix] The first run downloads about 1 GB and can take 15-30 minutes. Keep every window open;
echo             the browser opens by itself at the end. Later runs start in about a minute.
echo.
echo [AeroMatrix] Step 1 of 5: model API (its own window installs packages on the first run)

rem --- Model API: bootstrap.py creates backend\trained_model\.venv once, then serves ---
netstat -ano | findstr /r /c:":%AEROMATRIX_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [AeroMatrix] Port %AEROMATRIX_PORT% is already in use; assuming the model API is running there.
) else (
  start "AeroMatrix model API" /d "%MODEL_DIR%" cmd /k ""%PY312%" bootstrap.py start"
)

rem --- AeroSage assistant API: SETUP_CHATBOT.bat creates backend\chatbot\.venv and .env once ---
set "CHAT_DIR=%ROOT%\backend\chatbot"
if "%CHATBOT_PORT%"=="" set "CHATBOT_PORT=8010"
if exist "%CHAT_DIR%\START_CHATBOT.bat" (
  netstat -ano | findstr /r /c:":%CHATBOT_PORT% .*LISTENING" >nul
  if not errorlevel 1 (
    echo [AeroMatrix] Port %CHATBOT_PORT% is already in use; assuming AeroSage is running there.
  ) else (
    if not exist "%CHAT_DIR%\.venv\Scripts\python.exe" (
      echo [AeroMatrix] Step 2 of 5: setting up the AeroSage assistant ^(first run only^)...
      call "%CHAT_DIR%\SETUP_CHATBOT.bat"
    )
    if exist "%CHAT_DIR%\.venv\Scripts\python.exe" (
      start "AeroSage assistant API" /d "%CHAT_DIR%" cmd /k "START_CHATBOT.bat"
    ) else (
      echo [AeroMatrix] AeroSage setup failed; the app runs without the assistant. See backend\chatbot\README.md.
    )
  )
)

rem --- Task 2 model service: creates backend\task2_model\.venv once from its pinned requirements.txt ---
set "T2_DIR=%ROOT%\backend\task2_model"
set "T2_PY=%T2_DIR%\.venv\Scripts\python.exe"
if "%TASK2_PORT%"=="" set "TASK2_PORT=8030"
if exist "%T2_DIR%\aeromatrix_service.py" (
  netstat -ano | findstr /r /c:":%TASK2_PORT% .*LISTENING" >nul
  if not errorlevel 1 (
    echo [AeroMatrix] Port %TASK2_PORT% is already in use; assuming the Task 2 model service is running there.
  ) else (
    set "T2_READY="
    if exist "%T2_PY%" "%T2_PY%" -c "import sklearn, pandas, fastapi, uvicorn" >nul 2>nul && set "T2_READY=1"
    if not defined T2_READY (
      echo [AeroMatrix] Step 3 of 5: setting up Sensor Intelligence ^(first run only, about 400 MB, 5-15 minutes^)...
      if not exist "%T2_PY%" "%PY312%" -m venv "%T2_DIR%\.venv"
      if exist "%T2_PY%" "%T2_PY%" -m pip install --disable-pip-version-check -r "%T2_DIR%\requirements.txt"
      if exist "%T2_PY%" "%T2_PY%" -c "import sklearn, pandas, fastapi, uvicorn" >nul 2>nul && set "T2_READY=1"
    )
    if defined T2_READY (
      start "AeroMatrix Task 2 model API" /d "%T2_DIR%" cmd /k ""%T2_PY%" aeromatrix_service.py"
    ) else (
      echo [AeroMatrix] Task 2 setup failed; the app runs without the Sensors screen. See backend\task2_model\README.md.
    )
  )
)

rem --- Web app ---
where npm >nul 2>nul
if errorlevel 1 (
  echo [AeroMatrix] Node.js / npm was not found. Install Node.js LTS from nodejs.org, then run this again.
  pause
  exit /b 1
)
if not exist "%ROOT%\node_modules" (
  echo [AeroMatrix] Step 4 of 5: installing web app packages ^(first run only, several minutes^)...
  call npm install
  if errorlevel 1 ( echo [AeroMatrix] npm install failed. & pause & exit /b 1 )
)
set "VITE_AEROMATRIX_API_URL=http://127.0.0.1:%AEROMATRIX_PORT%"
set "VITE_LANDING_URL=http://localhost:3000/"
set "VITE_CHATBOT_API_URL=http://127.0.0.1:%CHATBOT_PORT%"
set "TASK2_API_TARGET=http://127.0.0.1:%TASK2_PORT%"
start "AeroMatrix web app" /d "%ROOT%" cmd /k "npm run dev -- --port 5173"

rem --- Landing page ---
set "OPEN_URL=http://localhost:5173/"
if exist "%ROOT%\landing\package.json" (
  if not exist "%ROOT%\landing\node_modules" (
    echo [AeroMatrix] Step 5 of 5: installing landing page packages ^(first run only^)...
    pushd "%ROOT%\landing"
    call npm install
    popd
  )
  set "VITE_MAIN_APP_URL=http://localhost:5173/"
  start "AeroMatrix landing page" /d "%ROOT%\landing" cmd /k "npm run dev -- --port 3000"
  set "OPEN_URL=http://localhost:3000/"
)

rem --- Open the browser once the app has had a moment to start ---
echo [AeroMatrix] All set up. Starting... the browser opens in a few seconds.
echo             If a page is blank, wait for the web app window to show "ready", then refresh.
timeout /t 10 /nobreak >nul
start "" "%OPEN_URL%"
echo [AeroMatrix] Running. Close the AeroMatrix windows to stop.
endlocal
