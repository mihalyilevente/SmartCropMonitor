#!/bin/bash

WEBHOOK_URL="${WEBHOOK_URL:-}"

if [ -z "${WEBHOOK_URL}" ]; then
    echo "[slack] WEBHOOK_URL not set, skipping notification"
    exit 0
fi

STATUS="${1:-info}"
MESSAGE="${2:-No message}"
HOSTNAME="${HOSTNAME:-server}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")

case "${STATUS}" in
    success) COLOR="#2eb886" ; ICON=":white_check_mark:" ;;
    error)   COLOR="#e01e5a" ; ICON=":x:" ;;
    warning) COLOR="#ecb22e" ; ICON=":warning:" ;;
    *)       COLOR="#36a64f" ; ICON=":information_source:" ;;
esac

PAYLOAD=$(cat <<JSON
{
  "attachments": [{
    "color": "${COLOR}",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "${ICON} *WRF Pipeline* | ${TIMESTAMP}\n${MESSAGE}"
        }
      },
      {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": "Host: \`${HOSTNAME}\`"}]
      }
    ]
  }]
}
JSON
)

curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "${PAYLOAD}" \
    "${WEBHOOK_URL}" > /dev/null