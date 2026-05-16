#!/bin/bash
# Reads only the wallet key from /opt/clash/shared/.env (avoids bash `source`
# which chokes on multi-word unquoted values like the BIP39 mnemonic stored
# in NFT_BASE — bash would try to run the second word as a command).
# Exports just what the diag script needs.
set -e
KEY_LINE="$(sudo grep -E '^DECIBEL_API_WALLET_PRIVATE_KEY=' /opt/clash/shared/.env || true)"
if [ -z "$KEY_LINE" ]; then
    echo "DECIBEL_API_WALLET_PRIVATE_KEY not in /opt/clash/shared/.env" >&2
    exit 1
fi
export DECIBEL_API_WALLET_PRIVATE_KEY="${KEY_LINE#DECIBEL_API_WALLET_PRIVATE_KEY=}"
APIKEY_LINE="$(sudo grep -E '^APTOS_NODE_API_KEY=' /opt/clash/shared/.env || true)"
if [ -n "$APIKEY_LINE" ]; then
    export APTOS_NODE_API_KEY="${APIKEY_LINE#APTOS_NODE_API_KEY=}"
fi
exec node /tmp/decibel-signer-info.js
