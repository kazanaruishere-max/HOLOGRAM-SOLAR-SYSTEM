@echo off
echo Starting AR Solar System Hologram Server...
echo.

cd backend

REM Check if virtual environment exists
if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Virtual environment not found. Using system Python.
    echo.
    echo To create a virtual environment, run:
    echo   py -m venv venv
    echo   venv\Scripts\activate
    echo   py -m pip install -r requirements.txt
    echo.
)

REM Check if requirements are installed
py -c "import flask" 2>nul
if errorlevel 1 (
    echo.
    echo Dependencies not installed. Installing...
    py -m pip install -r requirements.txt
    echo.
)

echo Starting Flask server...
echo Open http://localhost:5000 in your browser
echo Press Ctrl+C to stop the server
echo.

py app.py

pause

