#!/bin/bash
# Start all Agentic DEX services
set -e
cd "$(dirname "$0")"

echo "Starting backend API..."
nohup node Scripts/agent_server.js > /tmp/backend.log 2>&1 &
echo $! > /tmp/backend.pid

sleep 2
echo "Starting Python AI agent..."
cd Dex_Mcp
nohup env PYTHONUNBUFFERED=1 uv run python -m src.dex_mcp.Dex_Multi_Agent --interval 60 > /tmp/agent_bg.log 2>&1 &
echo $! > /tmp/agent.pid
cd ..

echo "All services started."
echo "  Backend PID: $(cat /tmp/backend.pid)"
echo "  Agent PID:   $(cat /tmp/agent.pid)"
echo ""
echo "Backend log: /tmp/backend.log"
echo "Agent log:   /tmp/agent_bg.log"
echo ""
echo "Verify: curl http://127.0.0.1:8000?action=get_status"
echo "Stop:   kill $(cat /tmp/backend.pid) $(cat /tmp/agent.pid)"
