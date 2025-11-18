#!/bin/bash

# Development Environment Startup Script
# Starts OpenFGA, Gateway, and UI in development mode

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
OPENFGA_PORT="${OPENFGA_PORT:-8080}"
GATEWAY_PORT="${GATEWAY_PORT:-4000}"
UI_PORT="${UI_PORT:-3000}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# PIDs for cleanup
GATEWAY_PID=""
UI_PID=""

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function (for trap)
cleanup() {
    echo ""
    log_info "Received interrupt signal..."
    # Services are running detached, so just inform the user
    echo -e "${YELLOW}Services are still running in background.${NC}"
    echo -e "${YELLOW}Use './scripts/dev.sh stop' to stop them.${NC}"
    exit 0
}

# Set up trap for cleanup on exit
trap cleanup SIGINT SIGTERM

# Kill any existing processes on our ports
kill_existing() {
    log_info "Checking for existing processes..."
    
    # Kill processes on Gateway port
    if lsof -ti:$GATEWAY_PORT > /dev/null 2>&1; then
        log_info "Killing existing process on port $GATEWAY_PORT"
        lsof -ti:$GATEWAY_PORT | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Kill processes on UI port
    if lsof -ti:$UI_PORT > /dev/null 2>&1; then
        log_info "Killing existing process on port $UI_PORT"
        lsof -ti:$UI_PORT | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Check if OpenFGA is running, start if not
ensure_openfga() {
    if curl -s -m 2 "http://localhost:${OPENFGA_PORT}/healthz" > /dev/null 2>&1; then
        log_success "OpenFGA is already running on port $OPENFGA_PORT"
    else
        log_info "OpenFGA not running. Starting..."
        "$SCRIPT_DIR/setup-openfga.sh"
        echo ""
    fi
}

# Log files
LOG_DIR="$PROJECT_ROOT/.logs"
GATEWAY_LOG="$LOG_DIR/gateway.log"
UI_LOG="$LOG_DIR/ui.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Start Gateway
start_gateway() {
    log_info "Starting Gateway on port $GATEWAY_PORT..."
    
    cd "$PROJECT_ROOT/packages/gateway"
    nohup bun run --watch src/index.ts > "$GATEWAY_LOG" 2>&1 &
    GATEWAY_PID=$!
    disown $GATEWAY_PID 2>/dev/null || true
    
    # Wait for Gateway to be ready
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if curl -s -m 2 "http://localhost:${GATEWAY_PORT}/health" > /dev/null 2>&1; then
            log_success "Gateway is ready (PID: $GATEWAY_PID)"
            echo "$GATEWAY_PID" > "$LOG_DIR/gateway.pid"
            return 0
        fi
        attempts=$((attempts + 1))
        sleep 0.5
    done
    
    log_error "Gateway failed to start. Check logs: $GATEWAY_LOG"
    cat "$GATEWAY_LOG" 2>/dev/null | tail -20
    exit 1
}

# Start UI
start_ui() {
    log_info "Starting UI on port $UI_PORT..."
    
    cd "$PROJECT_ROOT/packages/ui"
    nohup ./node_modules/.bin/vite --port $UI_PORT > "$UI_LOG" 2>&1 &
    UI_PID=$!
    disown $UI_PID 2>/dev/null || true
    
    # Wait for UI to be ready (check if port is listening)
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if lsof -ti:$UI_PORT > /dev/null 2>&1; then
            sleep 0.5
            log_success "UI is ready (PID: $UI_PID)"
            echo "$UI_PID" > "$LOG_DIR/ui.pid"
            return 0
        fi
        attempts=$((attempts + 1))
        sleep 0.5
    done
    
    log_error "UI failed to start. Check logs: $UI_LOG"
    cat "$UI_LOG" 2>/dev/null | tail -20
    exit 1
}

# Print status
print_status() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   Development Environment Ready!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${CYAN}Services:${NC}"
    echo -e "    ${BLUE}OpenFGA:${NC}     http://localhost:${OPENFGA_PORT}"
    echo -e "    ${BLUE}Gateway:${NC}     http://localhost:${GATEWAY_PORT}  (PID: $GATEWAY_PID)"
    echo -e "    ${BLUE}Admin UI:${NC}    http://localhost:${UI_PORT}  ${GREEN}← Open this in your browser${NC}"
    echo ""
    echo -e "  ${CYAN}Logs:${NC}"
    echo -e "    ${BLUE}Gateway:${NC}     $GATEWAY_LOG"
    echo -e "    ${BLUE}UI:${NC}          $UI_LOG"
    echo ""
    echo -e "  ${CYAN}Commands:${NC}"
    echo -e "    ${YELLOW}Stop services:${NC}  ./scripts/dev.sh stop"
    echo -e "    ${YELLOW}View logs:${NC}      tail -f $LOG_DIR/*.log"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
}

# Open browser (optional)
open_browser() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "http://localhost:${UI_PORT}" 2>/dev/null || true
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "http://localhost:${UI_PORT}" 2>/dev/null || true
    fi
}

# Stop services
stop_services() {
    log_info "Stopping services..."
    
    # Read PIDs from files
    if [ -f "$LOG_DIR/gateway.pid" ]; then
        local gw_pid=$(cat "$LOG_DIR/gateway.pid")
        if kill -0 "$gw_pid" 2>/dev/null; then
            kill "$gw_pid" 2>/dev/null
            log_success "Gateway stopped (PID: $gw_pid)"
        fi
        rm -f "$LOG_DIR/gateway.pid"
    fi
    
    if [ -f "$LOG_DIR/ui.pid" ]; then
        local ui_pid=$(cat "$LOG_DIR/ui.pid")
        if kill -0 "$ui_pid" 2>/dev/null; then
            kill "$ui_pid" 2>/dev/null
            log_success "UI stopped (PID: $ui_pid)"
        fi
        rm -f "$LOG_DIR/ui.pid"
    fi
    
    # Kill any remaining processes on ports
    lsof -ti:$GATEWAY_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:$UI_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    
    log_success "All services stopped"
    echo -e "${YELLOW}Note: OpenFGA may still be running. Stop with: bun run openfga:stop${NC}"
}

# Main
main() {
    cd "$PROJECT_ROOT"
    
    # Handle stop command
    if [[ "$1" == "stop" ]]; then
        stop_services
        exit 0
    fi
    
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        OpenFGA Admin UI - Development Environment            ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    kill_existing
    ensure_openfga
    start_gateway
    start_ui
    print_status
    
    # Open browser if --open flag is passed
    if [[ "$1" == "--open" ]] || [[ "$1" == "-o" ]]; then
        open_browser
    fi
    
    # Services are running in background, script exits
    log_info "Services running in background. Use './scripts/dev.sh stop' to stop."
}

main "$@"
