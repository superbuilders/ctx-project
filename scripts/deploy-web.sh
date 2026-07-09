#!/bin/bash
# deploy-web.sh — Deploy the ctx web application to the EC2 instance
# Usage: ./scripts/deploy-web.sh [host]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/packages/web"

# Get host from argument or SST outputs
if [ -n "${1:-}" ]; then
  HOST="$1"
else
  echo "Fetching host from SST outputs..."
  if [ -f "$PROJECT_ROOT/.sst/outputs.json" ]; then
    HOST=$(jq -r '.publicIp // empty' "$PROJECT_ROOT/.sst/outputs.json" 2>/dev/null || true)
  fi
  if [ -z "${HOST:-}" ]; then
    echo "ERROR: Could not determine host IP. Pass it as argument:"
    echo "  $0 <ip-address>"
    exit 1
  fi
fi

SSH_USER="ubuntu"
REMOTE_DIR="/opt/ctx-web/app"

echo "═══════════════════════════════════════════"
echo "  ctx web deploy → $HOST"
echo "═══════════════════════════════════════════"

# ── Build the Next.js app ──────────────────────────────────
echo ""
echo "[1/4] Building Next.js app..."
cd "$WEB_DIR"

if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies..."
  npm install
fi

echo "  Building..."
npx next build

echo "  ✓ Build complete"

# ── Package the standalone build ───────────────────────────
echo ""
echo "[2/4] Packaging build..."
BUILD_DIR="$WEB_DIR/.next/standalone"

# Copy static assets into standalone
cp -r "$WEB_DIR/.next/static" "$BUILD_DIR/.next/static" 2>/dev/null || true
cp -r "$WEB_DIR/public" "$BUILD_DIR/public" 2>/dev/null || true

echo "  ✓ Package ready"

# ── Upload to instance ─────────────────────────────────────
echo ""
echo "[3/4] Uploading to $HOST..."

ssh -o StrictHostKeyChecking=no "$SSH_USER@$HOST" \
  "sudo mkdir -p $REMOTE_DIR && sudo chown -R $SSH_USER:$SSH_USER /opt/ctx-web"

rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$BUILD_DIR/" \
  "$SSH_USER@$HOST:$REMOTE_DIR/"

echo "  ✓ Upload complete"

# ── Restart the service ────────────────────────────────────
echo ""
echo "[4/4] Restarting ctx-web service..."
ssh -o StrictHostKeyChecking=no "$SSH_USER@$HOST" << 'RESTART'
  sudo chown -R root:root /opt/ctx-web/app
  sudo systemctl restart ctx-web
  sleep 2
  if sudo systemctl is-active --quiet ctx-web; then
    echo "  ✓ ctx-web service is running"
  else
    echo "  ✗ ctx-web service failed to start"
    sudo journalctl -u ctx-web --no-pager -n 20
    exit 1
  fi
RESTART

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ Deploy complete!"
echo "  Web: https://ctx.superbuilders.social"
echo "  SSH: ssh ubuntu@$HOST"
echo "═══════════════════════════════════════════"
