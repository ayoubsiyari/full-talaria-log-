#!/usr/bin/env python3
"""
Trading Chart - Startup Script
Run this to start the application
"""

import subprocess
import sys
import os
import webbrowser
import time
from pathlib import Path

def check_dependencies():
    """Check if required packages are installed"""
    print("🔍 Checking dependencies...")
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        print("✅ All dependencies installed")
        return True
    except ImportError as e:
        print(f"❌ Missing dependency: {e.name}")
        print("\n📦 Installing dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        return True

def create_directories():
    """Create necessary directories"""
    Path("uploads").mkdir(exist_ok=True)
    print("✅ Directories created")

def start_server():
    """Start the FastAPI server"""
    print("\n" + "="*50)
    print("🚀 Starting Trading Chart Server...")
    print("="*50)
    print()
    print("📊 Sessions: http://localhost:8000/sessions.html")
    print("📈 Chart: http://localhost:8000/index.html")
    print("📚 API Docs: http://localhost:8000/docs")
    print("🌐 API Base: http://localhost:8000/api")
    print()
    print("Press Ctrl+C to stop the server")
    print("="*50)
    print()
    
    # Open browser after a short delay
    def open_browser():
        time.sleep(2)
        webbrowser.open('http://localhost:8000/sessions.html')
    
    import threading
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Start server
    import uvicorn
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

if __name__ == "__main__":
    try:
        check_dependencies()
        create_directories()
        start_server()
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)