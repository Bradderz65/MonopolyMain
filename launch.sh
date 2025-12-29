#!/bin/bash

# Monopoly Game Launcher
# This script starts the game server and displays connection information

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
    echo -e "${YELLOW}Shutting down Monopoly game...${NC}"
    
    # Kill the server process
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
        wait $SERVER_PID 2>/dev/null
    fi
    
    # Kill any remaining node processes for this project
    pkill -f "node.*monopoly" 2>/dev/null
    
    echo -e "${GREEN}Game server stopped. Thanks for playing!${NC}"
    exit 0
}

# Set up trap to catch Ctrl+C and other termination signals
trap cleanup SIGINT SIGTERM EXIT

# Kill any existing server processes
echo -e "${YELLOW}Stopping any existing Monopoly servers...${NC}"
pkill -f "node.*server/index.js" 2>/dev/null
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
echo "║              Multiplayer Online Board Game                    ║"
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

# Build the client if not already built
if [ ! -d "client/build" ]; then
    echo -e "${YELLOW}Building client application...${NC}"
    cd client && npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to build client application${NC}"
        exit 1
    fi
    cd ..
fi

echo ""
echo -e "${GREEN}Starting Monopoly game server...${NC}"
echo ""

# Start the server in the background
node server/index.js &
SERVER_PID=$!

# Wait a moment for the server to start
sleep 2

# Check if server started successfully
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${RED}Failed to start the game server${NC}"
    exit 1
fi

# Get network interfaces and IPs
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║                    GAME SERVER RUNNING                        ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}${CYAN}Connect to the game using one of these addresses:${NC}"
echo ""

# Localhost
echo -e "  ${YELLOW}Local Machine:${NC}"
echo -e "    ${BOLD}http://localhost:3001${NC}"
echo ""

# Get all network IPs
echo -e "  ${YELLOW}Network (for other devices):${NC}"

# Try different methods to get IP addresses
if command -v ip &> /dev/null; then
    # Linux with ip command
    IPS=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1')
elif command -v hostname &> /dev/null; then
    # Try hostname -I
    IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
elif command -v ifconfig &> /dev/null; then
    # Fallback to ifconfig
    IPS=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1')
fi

if [ -z "$IPS" ]; then
    echo -e "    ${RED}Could not detect network IP addresses${NC}"
    echo -e "    Check your network settings manually"
else
    while IFS= read -r ip; do
        if [ ! -z "$ip" ]; then
            echo -e "    ${BOLD}http://${ip}:3001${NC}"
        fi
    done <<< "$IPS"
fi

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Instructions:${NC}"
echo -e "  1. Open the address above in a web browser"
echo -e "  2. Enter your name and create or join a game"
echo -e "  3. Share the game code with friends on the same network"
echo -e "  4. Have fun playing Monopoly!"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server and exit${NC}"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Keep the script running and show server logs
wait $SERVER_PID
