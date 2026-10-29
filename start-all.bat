@echo off
REM CandleNexa - open backend and frontend in two windows
start "CandleNexa API" cmd /k "%~dp0backend\run_dev.bat"
timeout /t 3 >nul
start "CandleNexa UI" cmd /k "%~dp0frontend\run_dev.bat"
timeout /t 6 >nul
start http://localhost:5173
