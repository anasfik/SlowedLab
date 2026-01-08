#!/bin/bash

# SlowedLab - Quick Start Script
# Runs both backend and frontend servers

echo "🎵 Starting SlowedLab..."

# Check if backend dependencies are installed
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Start backend in background
echo "🚀 Starting backend server on port 3001..."
cd backend && npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "🎨 Starting frontend on port 3000..."
echo "📱 App will open at http://localhost:3000"
echo ""
echo "⚡ Features enabled:"
echo "   • Local file upload"
echo "   • YouTube URL support"
echo "   • Real-time audio effects"
echo "   • AI preset suggestions"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

cd frontend && npm start

# Cleanup on exit
trap "kill $BACKEND_PID 2>/dev/null" EXIT
