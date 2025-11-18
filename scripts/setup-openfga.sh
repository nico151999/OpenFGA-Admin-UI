#!/bin/bash

# OpenFGA Setup Script
# This script runs OpenFGA locally and seeds it with the authorization model

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
OPENFGA_PORT="${OPENFGA_PORT:-8080}"
OPENFGA_GRPC_PORT="${OPENFGA_GRPC_PORT:-8081}"
OPENFGA_PLAYGROUND_PORT="${OPENFGA_PLAYGROUND_PORT:-3001}"
STORE_NAME="admin-ui-test"
MODEL_FILE="$PROJECT_ROOT/model.fga"
OPENFGA_BIN="$PROJECT_ROOT/.bin/openfga"
OPENFGA_VERSION="1.8.2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m)"
    
    case "$ARCH" in
        x86_64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    case "$OS" in
        darwin) OS="darwin" ;;
        linux) OS="linux" ;;
        *) log_error "Unsupported OS: $OS"; exit 1 ;;
    esac
    
    log_info "Detected platform: ${OS}/${ARCH}"
}

# Download OpenFGA binary if not present
download_openfga() {
    if [ -f "$OPENFGA_BIN" ]; then
        log_success "OpenFGA binary already exists"
        return 0
    fi
    
    log_info "Downloading OpenFGA v${OPENFGA_VERSION}..."
    
    mkdir -p "$(dirname "$OPENFGA_BIN")"
    
    DOWNLOAD_URL="https://github.com/openfga/openfga/releases/download/v${OPENFGA_VERSION}/openfga_${OPENFGA_VERSION}_${OS}_${ARCH}.tar.gz"
    
    log_info "URL: $DOWNLOAD_URL"
    
    curl -sL "$DOWNLOAD_URL" | tar -xz -C "$(dirname "$OPENFGA_BIN")" openfga
    
    chmod +x "$OPENFGA_BIN"
    
    log_success "OpenFGA downloaded to $OPENFGA_BIN"
}

# Check if OpenFGA CLI is installed
check_fga_cli() {
    if ! command -v fga &> /dev/null; then
        log_warning "OpenFGA CLI (fga) not found. Installing via Homebrew..."
        if command -v brew &> /dev/null; then
            brew install openfga/tap/fga
        else
            log_error "Homebrew not found. Please install OpenFGA CLI manually:"
            log_error "  brew install openfga/tap/fga"
            log_error "  or visit: https://openfga.dev/docs/getting-started/install-sdk"
            exit 1
        fi
    fi
    log_success "OpenFGA CLI is available"
}

# Stop any existing OpenFGA process
stop_existing() {
    if pgrep -f "openfga run" > /dev/null 2>&1; then
        log_info "Stopping existing OpenFGA process..."
        pkill -f "openfga run" || true
        sleep 2
        log_success "Existing process stopped"
    fi
}

# Start OpenFGA
start_openfga() {
    log_info "Starting OpenFGA server..."
    
    # Start OpenFGA in background
    "$OPENFGA_BIN" run \
        --http-addr "0.0.0.0:${OPENFGA_PORT}" \
        --grpc-addr "0.0.0.0:${OPENFGA_GRPC_PORT}" \
        --playground-enabled=true \
        --playground-port "${OPENFGA_PLAYGROUND_PORT}" \
        > "$PROJECT_ROOT/.openfga.log" 2>&1 &
    
    OPENFGA_PID=$!
    echo "$OPENFGA_PID" > "$PROJECT_ROOT/.openfga.pid"
    
    # Wait for OpenFGA to be ready
    log_info "Waiting for OpenFGA to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "http://localhost:${OPENFGA_PORT}/healthz" > /dev/null 2>&1; then
            log_success "OpenFGA is ready! (PID: $OPENFGA_PID)"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
        echo -n "."
    done
    
    echo ""
    log_error "OpenFGA failed to start within ${max_attempts} seconds"
    cat "$PROJECT_ROOT/.openfga.log"
    exit 1
}

# Create store and seed model
seed_model() {
    log_info "Creating store and seeding model..."
    
    export FGA_API_URL="http://localhost:${OPENFGA_PORT}"
    
    # Create a new store
    log_info "Creating store: ${STORE_NAME}"
    STORE_RESPONSE=$(fga store create --name "$STORE_NAME" 2>&1)
    
    # Extract store ID from response
    STORE_ID=$(echo "$STORE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$STORE_ID" ]; then
        log_error "Failed to create store. Response: $STORE_RESPONSE"
        exit 1
    fi
    
    log_success "Store created with ID: $STORE_ID"
    
    # Set the store ID for subsequent commands
    export FGA_STORE_ID="$STORE_ID"
    
    # Write the authorization model
    log_info "Writing authorization model from $MODEL_FILE..."
    
    if [ ! -f "$MODEL_FILE" ]; then
        log_error "Model file not found: $MODEL_FILE"
        exit 1
    fi
    
    MODEL_RESPONSE=$(fga model write --file "$MODEL_FILE" 2>&1)
    
    # Extract model ID
    MODEL_ID=$(echo "$MODEL_RESPONSE" | grep -o '"authorization_model_id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$MODEL_ID" ]; then
        # Try alternative parsing
        MODEL_ID=$(echo "$MODEL_RESPONSE" | grep -oE '[a-zA-Z0-9]{26}' | head -1)
    fi
    
    if [ -n "$MODEL_ID" ]; then
        log_success "Model written with ID: $MODEL_ID"
    else
        log_warning "Model write response: $MODEL_RESPONSE"
    fi
    
    # Save connection info to a file for the admin UI
    CONNECTION_FILE="$PROJECT_ROOT/.openfga-connection"
    cat > "$CONNECTION_FILE" << EOF
# OpenFGA Connection Details (auto-generated)
# Use these values to connect the Admin UI

OPENFGA_API_URL=http://localhost:${OPENFGA_PORT}
OPENFGA_STORE_ID=${STORE_ID}
OPENFGA_MODEL_ID=${MODEL_ID}
EOF
    
    log_success "Connection details saved to $CONNECTION_FILE"
}

# Add some sample tuples for testing
seed_sample_tuples() {
    log_info "Adding sample tuples for testing..."
    
    export FGA_API_URL="http://localhost:${OPENFGA_PORT}"
    
    # Create sample tuples
    cat > /tmp/tuples.json << 'EOF'
{
  "writes": {
    "tuple_keys": [
      {"user": "user:alice", "relation": "super_admin", "object": "platform:main"},
      {"user": "user:bob", "relation": "admin", "object": "platform:main"},
      {"user": "user:charlie", "relation": "member", "object": "platform:main"},
      {"user": "user:diana", "relation": "member", "object": "platform:main"},
      {"user": "user:eve", "relation": "member", "object": "group:engineering"},
      {"user": "platform:main", "relation": "platform", "object": "group:engineering"},
      {"user": "user:alice", "relation": "member", "object": "group:engineering"},
      {"user": "platform:main", "relation": "platform", "object": "plan:pro"},
      {"user": "user:charlie", "relation": "subscriber", "object": "plan:pro"},
      {"user": "platform:main", "relation": "platform", "object": "agent:assistant-1"},
      {"user": "user:bob", "relation": "owner", "object": "agent:assistant-1"},
      {"user": "plan:pro", "relation": "required_plan", "object": "agent:assistant-1"},
      {"user": "user:*", "relation": "listed_publicly", "object": "agent:assistant-1"}
    ]
  }
}
EOF

    # Write tuples using curl (more reliable for batch writes)
    WRITE_RESPONSE=$(curl -s -X POST "http://localhost:${OPENFGA_PORT}/stores/${FGA_STORE_ID}/write" \
        -H "Content-Type: application/json" \
        -d @/tmp/tuples.json)
    
    if echo "$WRITE_RESPONSE" | grep -q "error"; then
        log_warning "Some tuples may have failed to write: $WRITE_RESPONSE"
    else
        log_success "Sample tuples added successfully"
    fi
    
    rm /tmp/tuples.json
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   OpenFGA Setup Complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}OpenFGA API:${NC}        http://localhost:${OPENFGA_PORT}"
    echo -e "  ${BLUE}OpenFGA gRPC:${NC}       localhost:${OPENFGA_GRPC_PORT}"
    echo -e "  ${BLUE}OpenFGA Playground:${NC} http://localhost:${OPENFGA_PLAYGROUND_PORT}"
    echo ""
    echo -e "  ${BLUE}Store ID:${NC}           ${FGA_STORE_ID}"
    echo -e "  ${BLUE}Model ID:${NC}           ${MODEL_ID:-'(check .openfga-connection)'}"
    echo ""
    echo -e "  ${YELLOW}To use with Admin UI:${NC}"
    echo -e "    1. Start the gateway:  ${BLUE}bun run dev:gateway${NC}"
    echo -e "    2. Start the UI:       ${BLUE}bun run dev:ui${NC}"
    echo -e "    3. Connect to:         ${BLUE}http://localhost:${OPENFGA_PORT}${NC}"
    echo ""
    echo -e "  ${YELLOW}Useful commands:${NC}"
    echo -e "    Stop OpenFGA:   ${BLUE}bun run openfga:stop${NC}"
    echo -e "    View logs:      ${BLUE}bun run openfga:logs${NC}"
    echo -e "    Restart:        ${BLUE}bun run openfga:setup${NC}"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
}

# Main execution
main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           OpenFGA Admin UI - Setup Script                     ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    detect_platform
    download_openfga
    check_fga_cli
    stop_existing
    start_openfga
    seed_model
    seed_sample_tuples
    print_summary
}

# Run main
main "$@"
