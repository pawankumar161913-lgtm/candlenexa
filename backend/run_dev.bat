@echo off
REM Start the CandleNexa API on http://127.0.0.1:8000
cd /d "%~dp0"
if not exist "..\.venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv ..\.venv
  call ..\.venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call ..\.venv\Scripts\activate.bat
)
python -m uvicorn app.main:app --reload --port 8000
