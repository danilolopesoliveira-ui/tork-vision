#!/bin/bash

echo "======================================"
echo "  TORK VISION — Starting Application  "
echo "======================================"

# Check if running with Docker
if command -v docker-compose &> /dev/null; then
  echo "Starting with Docker Compose..."
  docker-compose up --build
else
  echo "Starting in development mode..."

  # Backend
  echo "[1/2] Starting backend (FastAPI)..."
  cd backend
  pip install -r requirements.txt -q
  uvicorn main:app --reload --port 8000 &
  BACKEND_PID=$!
  cd ..

  # Frontend
  echo "[2/2] Starting frontend (React)..."
  cd frontend
  npm install --silent
  npm run dev &
  FRONTEND_PID=$!
  cd ..

  echo ""
  echo "✓ Backend:  http://localhost:8000"
  echo "✓ Frontend: http://localhost:3000"
  echo "✓ API Docs: http://localhost:8000/docs"
  echo ""
  echo "Press Ctrl+C to stop all services"

  # Wait for Ctrl+C
  trap "kill $BACKEND_PID $FRONTEND_PID; exit 0" INT
  wait
fi
