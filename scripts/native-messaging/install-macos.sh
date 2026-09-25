#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.webtomind.local_markdown"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/native-host.sh"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <EXTENSION_ID>"
  exit 1
fi

EXTENSION_ID="$1"

mkdir -p "$MANIFEST_DIR"
chmod +x "$HOST_SCRIPT"

cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "WebToMind Native Markdown Host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo "Installed Native Messaging host manifest:"
echo "$MANIFEST_PATH"
echo "Extension ID:"
echo "$EXTENSION_ID"
