@echo off
REM Start the CandleNexa UI on http://localhost:5173
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing frontend dependencies...
  npm install
)
npm run dev
