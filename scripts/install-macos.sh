#!/bin/bash
# Native macOS setup: aria2 via Homebrew, Prowlarr from the official release (the
# Homebrew cask is disabled upstream because the app is unsigned, so we sign it locally).
set -euo pipefail

PROWLARR_VERSION="${PROWLARR_VERSION:-2.5.2.5491}"
ARCH="$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64)"
URL="https://github.com/Prowlarr/Prowlarr/releases/download/v${PROWLARR_VERSION}/Prowlarr.master.${PROWLARR_VERSION}.osx-app-core-${ARCH}.zip"
TMP="$(mktemp -d)"

echo "==> aria2"
command -v aria2c >/dev/null || brew install aria2

echo "==> Prowlarr $PROWLARR_VERSION ($ARCH)"
curl -fL -o "$TMP/prowlarr.zip" "$URL"
unzip -q -o -d /Applications "$TMP/prowlarr.zip"
codesign --force --deep --sign - /Applications/Prowlarr.app
xattr -dr com.apple.quarantine /Applications/Prowlarr.app 2>/dev/null || true
rm -rf "$TMP"

echo "==> 启动 Prowlarr"
open -a /Applications/Prowlarr.app
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:9696/ && break
  sleep 2
done

echo
echo "Prowlarr 就绪。接着做两件事："
echo "  1) 打开 http://127.0.0.1:9696 完成初始设置（Settings 里可以看到 API Key）"
echo "  2) 写入 config.json 后运行：node scripts/bootstrap.mjs --test"
echo
echo "如果用 Motrix 作为下载器，把 aria2.rpc_url 指向 http://127.0.0.1:16800/jsonrpc 即可。"
