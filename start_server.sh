#!/bin/bash

echo "Starting AR Solar System Hologram Server..."
echo ""

cd backend

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
else
    echo "Virtual environment not found. Using system Python."
    echo ""
    echo "To create a virtual environment, run:"
    echo "  python3 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    echo ""
fi

# Check if requirements are installed
python3 -c "import flask" 2>/dev/null
if [ $? -ne 0 ]; then
    echo ""
    echo "Dependencies not installed. Installing..."
    pip install -r requirements.txt
    echo ""
fi

echo "Starting Flask server..."
echo "Open http://localhost:5000 in your browser"
echo "Press Ctrl+C to stop the server"
echo ""

python3 app.py

