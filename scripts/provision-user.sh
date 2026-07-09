#!/bin/bash
# ctx-provision — Create a new ctx user with full filesystem structure
# Usage: ctx-provision <username> <email> [preferred_name] [cognito_sub]

set -euo pipefail

USERNAME="${1:?Usage: ctx-provision <username> <email> [preferred_name] [cognito_sub]}"
EMAIL="${2:?Usage: ctx-provision <username> <email> [preferred_name] [cognito_sub]}"
PREFERRED_NAME="${3:-$USERNAME}"
COGNITO_SUB="${4:-}"
CTX_ROOT="/srv/ctx"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "Provisioning ctx user: $USERNAME ($EMAIL)"

# ── Create Unix user ──────────────────────────────────────
if ! id "$USERNAME" &>/dev/null; then
  useradd -m -d "$CTX_ROOT/home/$USERNAME" -s /bin/bash "$USERNAME"
  echo "  Created Unix user: $USERNAME"
else
  echo "  Unix user already exists: $USERNAME"
fi

HOME_DIR="$CTX_ROOT/home/$USERNAME"

# ── Create directory structure ────────────────────────────
mkdir -p "$HOME_DIR/.profile"
mkdir -p "$HOME_DIR/contexts"
mkdir -p "$HOME_DIR/logs"/{claude-code,claude-chat,chatgpt,codex,cursor}
mkdir -p "$HOME_DIR/notes"/{obsidian,granola}
mkdir -p "$HOME_DIR/pub"/{contexts,logs}

# ── Set permissions ───────────────────────────────────────
chmod 700 "$HOME_DIR"
chmod 700 "$HOME_DIR/.profile"
chmod 700 "$HOME_DIR/contexts"
chmod 700 "$HOME_DIR/logs"
chmod 700 "$HOME_DIR/notes"
chmod 750 "$HOME_DIR/pub"
chmod 750 "$HOME_DIR/pub/contexts"
chmod 750 "$HOME_DIR/pub/logs"

# ── Initialize contexts git repo ─────────────────────────
if [ ! -d "$HOME_DIR/contexts/.git" ]; then
  cd "$HOME_DIR/contexts"
  git init -q
  git config user.name "$PREFERRED_NAME"
  git config user.email "$EMAIL"

  cat > README.md << EOF
# Contexts

Knowledge artifacts and saved context documents.

Created: $NOW
EOF
  git add -A
  git commit -q -m "init: contexts directory for $USERNAME"
  echo "  Initialized contexts git repo"
fi

# ── Create profile documents ─────────────────────────────
if [ ! -f "$HOME_DIR/.profile/identity.md" ]; then
  cat > "$HOME_DIR/.profile/identity.md" << EOF
---
field: identity
updated: $NOW
---

- **Name:** $PREFERRED_NAME
- **Email:** $EMAIL
- **Provisioned:** $NOW
EOF
  echo "  Created identity.md"
fi

for section in bio projects expertise connections decisions; do
  if [ ! -f "$HOME_DIR/.profile/$section.md" ]; then
    cat > "$HOME_DIR/.profile/$section.md" << EOF
---
field: $section
updated: $NOW
---

*No $section yet. Edit this file to add content.*
EOF
  fi
done

# ── Create SSH keys directory ─────────────────────────────
mkdir -p "$CTX_ROOT/var/keys/$USERNAME"
chmod 700 "$CTX_ROOT/var/keys/$USERNAME"
touch "$CTX_ROOT/var/keys/$USERNAME/authorized_keys"
chmod 600 "$CTX_ROOT/var/keys/$USERNAME/authorized_keys"

# ── Set ownership ─────────────────────────────────────────
chown -R "$USERNAME:$USERNAME" "$HOME_DIR"
chown -R "$USERNAME:$USERNAME" "$CTX_ROOT/var/keys/$USERNAME"

# ── Update user-map ───────────────────────────────────────
if [ -n "$COGNITO_SUB" ]; then
  USER_MAP="$CTX_ROOT/var/user-map.json"
  if [ -f "$USER_MAP" ]; then
    TMP=$(mktemp)
    jq --arg sub "$COGNITO_SUB" --arg user "$USERNAME" --arg email "$EMAIL" \
      '. + {($sub): {"username": $user, "email": $email}}' \
      "$USER_MAP" > "$TMP" && mv "$TMP" "$USER_MAP"
    echo "  Updated user-map: $COGNITO_SUB → $USERNAME"
  fi
fi

echo "✓ User $USERNAME provisioned successfully"
echo "  Home: $HOME_DIR"
echo "  SSH keys: $CTX_ROOT/var/keys/$USERNAME/authorized_keys"
