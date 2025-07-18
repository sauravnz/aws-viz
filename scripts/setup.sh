#!/bin/bash

echo "🏗️  AWS Infrastructure Visualizer Setup"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm --version) detected"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm run install:all

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Check if Docker is available
echo ""
echo "🐳 Checking Docker availability..."
if command -v docker &> /dev/null; then
    echo "✅ Docker $(docker --version) detected"
    
    # Check if Docker Compose is available
    if command -v docker-compose &> /dev/null; then
        echo "✅ Docker Compose $(docker-compose --version) detected"
    else
        echo "⚠️  Docker Compose not found. You can still run with regular Docker."
    fi
else
    echo "⚠️  Docker not found. You can still run in development mode."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Available commands:"
echo "  npm run dev        - Start development servers"
echo "  npm run build      - Build for production"
echo "  docker-compose up  - Run with Docker (if available)"
echo ""
echo "📖 See README.md for detailed instructions" 