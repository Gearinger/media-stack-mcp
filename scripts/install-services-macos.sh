#!/bin/bash
# Install media-stack (and optionally Prowlarr) as launchd agents so they survive
# reboots and terminal sessions. Idempotent: safe to re-run.
#
#   bash scripts/install-services-macos.sh            # web UI + Prowlarr
#   bash scripts/install-services-macos.sh --web-only # web UI only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"
# launchd refuses stdout/stderr/WorkingDirectory on an external exFAT volume (exit 78,
# EX_CONFIG), so logs and the working directory stay on the local disk.
LOGS="$HOME/Library/Logs/media-stack"
mkdir -p "$AGENTS" "$LOGS"

write_agent() {
  local label="$1" plist="$AGENTS/$1.plist"
  shift
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>$label</string>"
    echo '  <key>ProgramArguments</key><array>'
    for arg in "$@"; do echo "    <string>$arg</string>"; done
    echo '  </array>'
    echo '  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>'
    echo "  <key>StandardOutPath</key><string>$LOGS/$label.out.log</string>"
    echo "  <key>StandardErrorPath</key><string>$LOGS/$label.err.log</string>"
    echo '  <key>WorkingDirectory</key><string>'"$HOME"'</string>'
    echo '</dict></plist>'
  } > "$plist"
  # launchd refuses world/group-writable plists with a bare "Input/output error".
  chmod 644 "$plist"
  launchctl unload "$plist" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || launchctl load -w "$plist"
  echo "已加载 $label"
}

echo "==> media-stack web (http://127.0.0.1:8787)"
write_agent "com.media-stack.web" "$NODE" "$ROOT/src/web/server.mjs"

if [ "${1:-}" != "--web-only" ] && [ -d /Applications/Prowlarr.app ]; then
  echo "==> Prowlarr (http://127.0.0.1:9696)"
  write_agent "com.media-stack.prowlarr" /Applications/Prowlarr.app/Contents/MacOS/Prowlarr --nobrowser
fi

echo
sleep 4
for probe in "8787 web" "9696 Prowlarr"; do
  set -- $probe
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://127.0.0.1:$1/" || true)
  printf "  %-9s → http %s\n" "$2" "${code:-失败}"
done
echo
echo "日志: $LOGS/"
echo "停止: launchctl bootout gui/\$(id -u)/com.media-stack.web"
echo "重启: launchctl kickstart -k gui/\$(id -u)/com.media-stack.web"
