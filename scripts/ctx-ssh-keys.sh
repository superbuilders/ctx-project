#!/bin/bash
# ctx-ssh-keys — AuthorizedKeysCommand for OpenSSH
# Called by sshd to look up a user's authorized public keys
# Usage: ctx-ssh-keys <username>

set -euo pipefail

USERNAME="${1:-}"
CTX_ROOT="/srv/ctx"
KEYS_DIR="$CTX_ROOT/var/keys"

if [ -z "$USERNAME" ]; then
  exit 0
fi

# Check system users (root, ubuntu, etc.) — don't manage their keys
if [ "$(id -u "$USERNAME" 2>/dev/null)" -lt 1000 ] 2>/dev/null; then
  exit 0
fi

# Output authorized keys for the user
KEY_FILE="$KEYS_DIR/$USERNAME/authorized_keys"
if [ -f "$KEY_FILE" ]; then
  cat "$KEY_FILE"
fi
