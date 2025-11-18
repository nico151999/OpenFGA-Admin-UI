#!/bin/bash

# Stop OpenFGA Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/.openfga.pid"

echo "Stopping OpenFGA..."

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm "$PID_FILE"
        echo "✓ OpenFGA stopped (PID: $PID)"
    else
        rm "$PID_FILE"
        echo "OpenFGA process not running (stale PID file removed)"
    fi
else
    # Try to find and kill by process name
    if pgrep -f "openfga run" > /dev/null 2>&1; then
        pkill -f "openfga run"
        echo "✓ OpenFGA stopped"
    else
        echo "OpenFGA is not running"
    fi
fi
