#!/bin/bash

# Monopoly Game Launcher - Development Mode
# This script starts the game with hot reloading enabled

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down Monopoly development servers...${NC}"
    
    # Kill the server processes
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
        wait $SERVER_PID 2>/dev/null
    fi
    if [ ! -z "$CLIENT_PID" ]; then
        kill $CLIENT_PID 2>/dev/null
        wait $CLIENT_PID 2>/dev/null
    fi
    
    # Kill any remaining node processes for this project
    pkill -f "node.*monopoly" 2>/dev/null
    
    echo -e "${GREEN}Development servers stopped. Thanks for coding!${NC}"
    exit 0
}

# Set up trap to catch Ctrl+C and other termination signals
trap cleanup SIGINT SIGTERM EXIT

# Kill any existing server processes
echo -e "${YELLOW}Stopping any existing Monopoly servers...${NC}"
pkill -f "node.*server/index.js" 2>/dev/null
pkill -f "react-scripts start" 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
fuser -k 3001/tcp 2>/dev/null
sleep 1

# Clear the screen
clear

# Display banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   ███╗   ███╗ ██████╗ ███╗   ██╗ ██████╗ ██████╗  ██████╗     ║"
echo "║   ████╗ ████║██╔═══██╗████╗  ██║██╔═══██╗██╔══██╗██╔═══██╗    ║"
echo "║   ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║██████╔╝██║   ██║    ║"
echo "║   ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║██╔═══╝ ██║   ██║    ║"
echo "║   ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║╚██████╔╝██║     ╚██████╔╝    ║"
echo "║   ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝      ╚═════╝     ║"
echo "║                                                               ║"
echo "║              🔧 DEVELOPMENT MODE 🔧                           ║"
echo "║         Hot Reloading Enabled - Edit & Refresh!               ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${BLUE}Node.js version: $(node --version)${NC}"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing server dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install server dependencies${NC}"
        exit 1
    fi
fi

if [ ! -d "client/node_modules" ]; then
    echo -e "${YELLOW}Installing client dependencies...${NC}"
    cd client && npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install client dependencies${NC}"
        exit 1
    fi
    cd ..
fi

# Install nodemon globally if not present (for server hot reload)
if ! command -v nodemon &> /dev/null; then
    echo -e "${YELLOW}Installing nodemon for server hot reloading...${NC}"
    npm install -g nodemon 2>/dev/null || {
        echo -e "${YELLOW}Using npx nodemon instead...${NC}"
    }
fi

echo ""
echo -e "${GREEN}Starting Monopoly development servers...${NC}"
echo ""

# Start the server with nodemon for hot reloading (or plain node)
if command -v nodemon &> /dev/null; then
    nodemon --watch server --ignore 'server/saved_games.json' server/index.js &
else
    npx -y nodemon --watch server --ignore 'server/saved_games.json' server/index.js &
fi
SERVER_PID=$!

# Wait a moment for the server to start
sleep 2

# Start the React development server
cd client
BROWSER=none npm start &
CLIENT_PID=$!
cd ..

# Wait for client to start
sleep 5

# Get network interfaces and IPs
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║              DEVELOPMENT SERVERS RUNNING                      ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}${CYAN}Connect to the game:${NC}"
echo ""
echo -e "  ${YELLOW}Client (React Dev Server):${NC}  ${BOLD}http://localhost:3000${NC}"
echo -e "  ${YELLOW}API Server:${NC}                  ${BOLD}http://localhost:3001${NC}"
echo -e "  ${YELLOW}Admin Dashboard:${NC}             ${BOLD}http://localhost:3001/admin${NC}"
echo ""

# Get all network IPs
echo -e "  ${YELLOW}Network (for other devices):${NC}"
if command -v ip &> /dev/null; then
    IPS=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1')
elif command -v hostname &> /dev/null; then
    IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
fi

if [ ! -z "$IPS" ]; then
    while IFS= read -r ip; do
        if [ ! -z "$ip" ]; then
            echo -e "    🎮 Game:  ${BOLD}http://${ip}:3000${NC}"
            echo -e "    🔧 Admin: ${BOLD}http://${ip}:3001/admin${NC}"
        fi
    done <<< "$IPS"
fi

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}🔥 HOT RELOADING ENABLED:${NC}"
echo -e "  ${YELLOW}•${NC} Edit client files (React) → Browser auto-refreshes"
echo -e "  ${YELLOW}•${NC} Edit server files → Server auto-restarts"
echo -e "  ${YELLOW}•${NC} Edit bot.js → Takes effect on next bot spawn"
echo ""
echo -e "${CYAN}🔧 ADMIN DASHBOARD:${NC}"
echo -e "  ${YELLOW}•${NC} Monitor active games in real-time"
echo -e "  ${YELLOW}•${NC} Use debug tools (move players, give money, etc.)"
echo -e "  ${YELLOW}•${NC} Reset all games if needed"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Keep the script running
wait
