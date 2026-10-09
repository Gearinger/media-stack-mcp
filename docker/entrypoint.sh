#!/bin/sh
set -eu

DOWNLOAD_DIR="${DOWNLOAD_DIR:-/downloads}"
CONFIG_DIR="${CONFIG_DIR:-/config}"
ARIA2_PORT="${ARIA2_PORT:-6800}"
ARIA2_SECRET="${ARIA2_SECRET:-}"
ARIA2_CONF="$CONFIG_DIR/aria2.conf"

mkdir -p "$DOWNLOAD_DIR" "$CONFIG_DIR" "$CONFIG_DIR/aria2-session"

if [ "${ARIA2_MANAGED:-1}" = "1" ]; then
  if [ -z "$ARIA2_SECRET" ]; then
    ARIA2_SECRET=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
    echo "[media-stack] generated aria2 RPC secret: $ARIA2_SECRET"
  fi

  cat > "$ARIA2_CONF" <<EOF
enable-rpc=true
rpc-listen-all=false
rpc-listen-port=$ARIA2_PORT
rpc-secret=$ARIA2_SECRET
dir=$DOWNLOAD_DIR
continue=true
file-allocation=none
max-concurrent-downloads=5
max-connection-per-server=8
min-split-size=10M
split=8
follow-torrent=true
enable-dht=true
bt-enable-lpd=true
enable-peer-exchange=true
seed-time=0
bt-save-metadata=true
bt-load-saved-metadata=true
input-file=$CONFIG_DIR/aria2-session/session.txt
save-session=$CONFIG_DIR/aria2-session/session.txt
save-session-interval=30
summary-interval=0
console-log-level=warn
log=$CONFIG_DIR/aria2.log
EOF

  touch "$CONFIG_DIR/aria2-session/session.txt"
  echo "[media-stack] starting aria2 (dir=$DOWNLOAD_DIR port=$ARIA2_PORT)"
  aria2c --conf-path="$ARIA2_CONF" >/dev/null 2>&1 &

  i=0
  while [ "$i" -lt 30 ]; do
    if node -e "fetch('http://127.0.0.1:$ARIA2_PORT/jsonrpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'1',method:'aria2.getVersion',params:['token:$ARIA2_SECRET']})}).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"; then
      echo "[media-stack] aria2 is up"
      break
    fi
    i=$((i + 1))
    sleep 1
  done

  export ARIA2_RPC_URL="http://127.0.0.1:$ARIA2_PORT/jsonrpc"
  export ARIA2_SECRET
fi

if [ "${1:-}" = "mcp" ]; then
  exec node /app/src/mcp.mjs
fi

exec node /app/src/web/server.mjs
