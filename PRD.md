# ctx — Product Requirements Document

**Version:** 0.1.0
**Date:** June 25, 2026
**License:** MIT
**Status:** Draft

---

## 1. Executive Summary

ctx is an open-source, Unix-native context layer for AI-augmented teams. It gives every team member and every AI agent a shared filesystem of markdown documents — contexts, conversation logs, notes, and profiles — backed by real Unix permissions, real files, and real directories on a remote Linux server.

One deployment serves one company. Authentication is handled by the company's existing AWS Cognito user pool (OIDC). The first time a user authenticates, ctx provisions their Unix home directory and filesystem structure. From that point forward, agents and humans interact with ctx through SSH (for CLI/agent access) and a Next.js web application (for browser-based reading, writing, search, and administration).

Infrastructure is defined and deployed with SST (Ion) on AWS.

---

## 2. Problem Statement

AI agents produce and consume enormous amounts of context — conversation logs, research artifacts, decision records, project briefs — but today this context is:

1. **Siloed by provider.** Claude conversations don't talk to ChatGPT conversations. Codex sessions don't know about Cursor sessions.
2. **Siloed by person.** Teammates can't see each other's agent work without manual copy-paste.
3. **Locked in proprietary formats.** Context is stored in application databases behind custom APIs, not in portable files.
4. **Invisible to agents.** Agents can't read the user's prior context without provider-specific SDKs and API keys.
5. **Hard to permission.** Sharing is all-or-nothing. There's no granular "share this folder with these 3 people" model.

ctx solves all five by making the filesystem the database, SSH the API, Unix permissions the auth layer, and markdown the schema.

---

## 3. Principles

1. **Files are the source of truth.** There is no database that the files are derived from. The files *are* the data. Every index, cache, and search layer is derived and can be rebuilt from the files.

2. **Unix is the platform.** We don't reinvent permissions, users, groups, pipes, or tools. We use the ones that have been debugged for 50 years.

3. **Agents are first-class users.** An agent running as `aj` can `cat`, `grep`, and `ls` over SSH. No SDK. No API key. No client library. The protocol is the filesystem.

4. **Plain text is the format.** Markdown with YAML frontmatter. Readable by humans, parseable by machines, diffable by git, greppable by ripgrep. No proprietary encoding.

5. **One deployment, one company.** ctx is not a multi-tenant SaaS. It's infrastructure you deploy in your own AWS account, pointed at your own Cognito pool. Your data never leaves your account.

6. **Progressive enhancement.** The system works with just files and SSH. Full-text search, semantic search, the web UI, and ingestion adapters are layers on top. Each can fail without breaking the others.

7. **Open source, MIT license.** No open-core bait-and-switch. The full system — infra, web app, CLI, adapters — is MIT-licensed.

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Account                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │   Cognito     │    │          EC2 Instance (ctx-host)     │   │
│  │   User Pool   │◄──►│                                      │   │
│  │  (existing)   │    │  ┌────────────┐  ┌───────────────┐  │   │
│  └──────────────┘    │  │  ctx-sshd   │  │  ctx-web      │  │   │
│                       │  │  (SSH gate) │  │  (Next.js)    │  │   │
│  ┌──────────────┐    │  └──────┬─────┘  └───────┬───────┘  │   │
│  │   ALB         │◄──►│        │                 │          │   │
│  │  (HTTPS)      │    │        ▼                 ▼          │   │
│  └──────────────┘    │  ┌────────────────────────────────┐  │   │
│                       │  │        /srv/ctx/               │  │   │
│  ┌──────────────┐    │  │   EBS volume (gp3, encrypted)  │  │   │
│  │   S3          │    │  │                                │  │   │
│  │  (backups)    │◄───│  │   home/aj/contexts/...         │  │   │
│  └──────────────┘    │  │   home/tiger/logs/...           │  │   │
│                       │  │   teams/nessielabs/...          │  │   │
│  ┌──────────────┐    │  │   var/search/                   │  │   │
│  │   EFS         │    │  └────────────────────────────────┘  │   │
│  │  (optional    │    │                                      │   │
│  │   shared fs)  │    │  ┌────────────────────────────────┐  │   │
│  └──────────────┘    │  │  ctx-ingestd (adapter daemons)  │  │   │
│                       │  │  ctx-indexd  (search indexer)   │  │   │
│                       │  │  ctx-gitd    (auto-commit)     │  │   │
│                       │  └────────────────────────────────┘  │   │
│                       └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Summary

| Component | Role | Technology |
|---|---|---|
| **ctx-host** | Linux server hosting the filesystem | EC2 (t3.medium+), Ubuntu 24.04, EBS gp3 |
| **ctx-sshd** | SSH gateway for CLI/agent access | OpenSSH with Cognito-backed auth (PAM or AuthorizedKeysCommand) |
| **ctx-web** | Web UI for browser access | Next.js 15 (App Router), deployed on same host or as ECS/Lambda |
| **ctx-indexd** | Full-text search indexer | Daemon watching inotify, indexing into SQLite FTS5 or Tantivy |
| **ctx-ingestd** | Provider adapters | Per-provider daemons writing markdown to `logs/` |
| **ctx-gitd** | Auto-commit daemon | Watches `contexts/` dirs, commits changes periodically |
| **Cognito** | Authentication (OIDC) | Customer's existing user pool |
| **ALB** | HTTPS termination, routing | AWS ALB with Cognito integration |
| **S3** | Backups | Daily encrypted snapshots of `/srv/ctx/` |
| **EBS** | Primary storage | gp3, encrypted, snapshotted |

---

## 5. Filesystem Schema

### 5.1 Directory Layout

```
/srv/ctx/
├── home/                              # per-user home directories
│   └── {username}/                    # Unix user, created on first login
│       ├── .profile/                  # structured identity documents
│       │   ├── identity.md            # name, email, role, employer
│       │   ├── bio.md                 # freeform biography
│       │   ├── projects.md            # active projects
│       │   ├── connections.md         # people and relationships
│       │   ├── decisions.md           # personal decision log
│       │   └── expertise.md           # skills and domains
│       │
│       ├── contexts/                  # saved knowledge artifacts (git-tracked)
│       │   ├── .git/                  # version history
│       │   ├── {slug}.md             # a context document
│       │   └── {folder}/             # organizational subdirectory
│       │       └── {slug}.md
│       │
│       ├── logs/                      # agent conversation transcripts (immutable)
│       │   └── {provider}/           # claude-code, claude-chat, codex, chatgpt, cursor, ...
│       │       └── {ISO-timestamp}.md # one file per session
│       │
│       ├── notes/                     # synced external notes
│       │   ├── obsidian/             # Obsidian vault mirror
│       │   └── granola/              # meeting notes
│       │
│       └── pub/                       # explicitly shared content
│           ├── contexts/              # contexts shared with team
│           └── logs/                  # transcripts shared with team
│
├── teams/                             # team-level shared spaces
│   └── {team-slug}/                   # owned by group ctx-{team-slug}
│       ├── docs/                      # team-authored documents
│       ├── decisions/                 # team decision log
│       ├── templates/                 # shared context templates
│       └── members.txt               # member list (informational)
│
└── var/                               # system-level operational data
    ├── search/                        # FTS index (SQLite or Tantivy)
    ├── ingest/                        # ingestion adapter state
    ├── backups/                       # backup metadata
    └── log/                           # daemon logs
```

### 5.2 File Format: Context Document

```markdown
---
title: "Nessie Architecture Overview"
created: 2026-06-20T14:30:00Z
modified: 2026-06-25T09:15:00Z
author: aj
tags: [nessie, architecture, storage, design]
sources:
  - logs/claude-code/2026-06-20T14-30-00Z.md
  - logs/claude-code/2026-06-22T11-00-00Z.md
emoji: "🏗️"
status: active          # active | archived | draft
---

## Storage Layer

Nessie uses GRDB (SQLite) as its local storage engine...
```

### 5.3 File Format: Agent Log

```markdown
---
provider: claude-code
session_id: "sess_abc123"
repo: "github.com/nessielabs/nessie"
started: 2026-06-25T14:30:00Z
ended: 2026-06-25T16:45:00Z
model: "claude-sonnet-4-20250514"
cost_usd: 0.42
tags: [nessie, storage, refactor]
---

## User

What are the differences between nessie's storage schema and workflowy's?

## Assistant

Let me first check if there's a "Nessie" project in the current workspace...

---

## User

what would it look like to design an alternative...

## Assistant

...
```

### 5.4 File Format: Profile Document

```markdown
---
field: identity
updated: 2026-06-25T09:00:00Z
---

- **Name:** AJ Beckner
- **Preferred name:** AJ
- **Email:** aj@nessielabs.com
- **Employer:** Nessie Labs
- **Title:** Co-founder & CEO
- **Location:** San Francisco, CA
```

### 5.5 Permissions Model

| Path | Owner | Mode | Group | Effect |
|---|---|---|---|---|
| `/srv/ctx/home/aj/` | `aj` | `700` | — | Only aj can access |
| `/srv/ctx/home/aj/pub/` | `aj` | `750` | `ctx-nessielabs` | Team can read aj's shared content |
| `/srv/ctx/home/aj/pub/contexts/brief.md` | `aj` | `640` | `ctx-nessielabs` | Team can read this specific file |
| `/srv/ctx/teams/nessielabs/` | `root` | `2770` | `ctx-nessielabs` | Team members can read/write; setgid inherits group |
| `/srv/ctx/home/aj/contexts/private.md` | `aj` | `600` | — | Only aj; not even group-readable |

Fine-grained sharing beyond group membership uses POSIX ACLs:

```bash
# Share one file with one person
setfacl -m u:tiger:r /srv/ctx/home/aj/contexts/hiring/james-park-brief.md

# Share a directory with a cross-functional group
setfacl -m g:ctx-eng:rx /srv/ctx/home/aj/pub/contexts/
```

---

## 6. Authentication & User Provisioning

### 6.1 Flow: First Login (Web)

```
User → ALB → Cognito OIDC → callback → ctx-web
  1. User visits https://ctx.company.com
  2. ALB redirects to Cognito hosted UI (or company IdP behind Cognito)
  3. User authenticates (SSO, password, MFA — whatever Cognito is configured for)
  4. Cognito returns OIDC tokens to ALB
  5. ALB forwards authenticated request to ctx-web with claims in headers
  6. ctx-web reads `sub`, `email`, `preferred_username` from claims
  7. ctx-web calls ctx-provision API:
     a. Check if Unix user exists for this Cognito sub
     b. If not: create Unix user, create home directory structure, 
        initialize contexts/ git repo, populate .profile/identity.md
        from Cognito claims, add user to appropriate groups
     c. Return user metadata
  8. User sees their ctx home in the web UI
```

### 6.2 Flow: SSH Access (Agent/CLI)

```
Agent → SSH → ctx-sshd → PAM/AuthorizedKeysCommand → ctx-host
  1. User generates an SSH key pair locally
  2. User registers their public key via ctx-web (stored in ~/.ssh/authorized_keys
     on ctx-host, or via AuthorizedKeysCommand that queries a keys database)
  3. Agent connects: ssh aj@ctx.company.com
  4. OpenSSH authenticates via public key
  5. Agent has a shell as Unix user `aj`, scoped to their permissions
  6. Standard Unix tools work: cat, ls, grep, find, etc.
```

**Alternative SSH auth: short-lived certificates.**

```
  1. User authenticates to ctx-web via Cognito
  2. ctx-web issues a short-lived SSH certificate signed by a ctx CA
  3. Agent uses the certificate to SSH (no permanent key registration needed)
  4. ctx-sshd trusts the CA, maps certificate principal to Unix user
```

### 6.3 Username Derivation

The Unix username is derived deterministically from Cognito claims:

1. Use `preferred_username` if set, lowercased, alphanumeric + hyphens only
2. Else use the local part of `email`, same normalization
3. If collision, append a numeric suffix
4. Store the mapping: Cognito `sub` → Unix username in `/srv/ctx/var/user-map.json`

### 6.4 Group/Team Provisioning

Teams are configured via the ctx-web admin UI or a config file:

```yaml
# /srv/ctx/var/teams.yaml
teams:
  - slug: nessielabs
    name: Nessie Labs
    cognito_group: NessieLabs      # optional: auto-add users in this Cognito group
    members: [aj, tiger, sarah]    # explicit member list
  - slug: eng
    name: Engineering
    cognito_group: Engineering
    members: [aj, tiger]
```

When a user is added to a team (via Cognito group sync or manual config), the provisioner:

1. Creates the Unix group `ctx-{team-slug}` if it doesn't exist
2. Adds the user to the group (`usermod -aG ctx-{team-slug} {username}`)
3. Creates `/srv/ctx/teams/{team-slug}/` if it doesn't exist (mode `2770`, group `ctx-{team-slug}`)
4. Ensures the user's `pub/` directory has correct group ownership

---

## 7. Infrastructure (SST on AWS)

### 7.1 SST Stack Definition

```typescript
// sst.config.ts — conceptual structure
export default $config({
  app(input) {
    return {
      name: "ctx",
      removal: "retain",
      home: "aws",
    };
  },
  async run() {
    // --- Inputs (provided by deploying company) ---
    const cognitoUserPoolId = new sst.Secret("CognitoUserPoolId");
    const cognitoClientId = new sst.Secret("CognitoClientId");
    const cognitoDomain = new sst.Secret("CognitoDomain");
    const domainName = new sst.Secret("DomainName");   // e.g. ctx.company.com

    // --- Networking ---
    const vpc = new sst.aws.Vpc("CtxVpc", { nat: "managed" });

    // --- Storage ---
    const ebsVolume = new aws.ebs.Volume("CtxData", {
      availabilityZone: "us-east-1a",
      size: 100,               // GB, adjustable
      type: "gp3",
      encrypted: true,
      tags: { Name: "ctx-data" },
    });

    const backupBucket = new sst.aws.Bucket("CtxBackups", {
      versioning: true,
    });

    // --- Compute ---
    const ctxHost = new aws.ec2.Instance("CtxHost", {
      ami: "ami-ubuntu-24.04",       // latest Ubuntu 24.04
      instanceType: "t3.medium",
      subnetId: vpc.privateSubnets[0],
      securityGroups: [ctxSg.id],
      keyName: "ctx-admin",
      userData: userDataScript,       // bootstrap script (see §7.2)
      ebsBlockDevices: [{
        deviceName: "/dev/sdf",
        volumeId: ebsVolume.id,
      }],
      tags: { Name: "ctx-host" },
    });

    // --- Load Balancer ---
    const alb = new sst.aws.Router("CtxRouter", {
      domain: domainName,
      routes: {
        "/*": ctxHost.privateIp + ":3000",     // ctx-web (Next.js)
      },
    });

    // --- DNS ---
    // SSH access via NLB or direct EIP
    const nlb = new aws.lb.LoadBalancer("CtxSsh", {
      loadBalancerType: "network",
      subnets: vpc.publicSubnets,
    });
    // Forward port 22 to ctx-host
  },
});
```

### 7.2 Bootstrap Script (User Data)

The EC2 instance is configured on first boot:

```bash
#!/bin/bash
set -euo pipefail

# Mount EBS volume
mkfs.ext4 /dev/sdf || true    # only format if new
mkdir -p /srv/ctx
mount /dev/sdf /srv/ctx
echo '/dev/sdf /srv/ctx ext4 defaults 0 2' >> /etc/fstab

# Initialize directory structure
mkdir -p /srv/ctx/{home,teams,var/{search,ingest,backups,log}}
chmod 755 /srv/ctx
chmod 755 /srv/ctx/home
chmod 755 /srv/ctx/teams
chmod 750 /srv/ctx/var

# Install dependencies
apt-get update && apt-get install -y \
  openssh-server \
  git \
  ripgrep \
  acl \
  jq \
  nodejs npm \
  sqlite3 \
  inotify-tools

# Install ctx system components
npm install -g ctx-web ctx-indexd ctx-gitd ctx-provision

# Configure SSH
cat >> /etc/ssh/sshd_config <<EOF
AuthorizedKeysCommand /usr/local/bin/ctx-ssh-keys %u
AuthorizedKeysCommandUser nobody
ChrootDirectory none
AllowAgentForwarding no
EOF
systemctl restart sshd

# Start services
systemctl enable ctx-web ctx-indexd ctx-gitd
systemctl start ctx-web ctx-indexd ctx-gitd

# Configure daily backup to S3
cat > /etc/cron.daily/ctx-backup <<'EOF'
#!/bin/bash
tar czf - /srv/ctx/home /srv/ctx/teams | \
  aws s3 cp - s3://${BACKUP_BUCKET}/$(date +%Y-%m-%d).tar.gz --sse
EOF
chmod +x /etc/cron.daily/ctx-backup
```

### 7.3 Security Groups

| Rule | Port | Source | Purpose |
|---|---|---|---|
| Inbound SSH | 22 | Company VPN CIDR / agent IPs | CLI and agent access |
| Inbound HTTPS | 443 | 0.0.0.0/0 (via ALB) | Web UI |
| Inbound HTTP | 3000 | ALB security group | Next.js from ALB |
| Outbound HTTPS | 443 | 0.0.0.0/0 | Cognito, AI provider APIs (for ingestion) |

---

## 8. Web Application (Next.js)

### 8.1 Overview

The ctx-web application is a Next.js 15 App Router application that provides browser-based access to the filesystem. It runs on the same host as the filesystem (or in an adjacent container/Lambda with NFS/EFS access).

**Key constraint:** The web app reads and writes the same files that SSH users see. There is no separate database. The filesystem *is* the API.

### 8.2 Authentication Flow

```
Browser → ALB (Cognito auth) → ctx-web
  - ALB handles OIDC flow with Cognito
  - ALB injects x-amzn-oidc-claims header
  - ctx-web middleware extracts identity from claims
  - ctx-web impersonates the Unix user for file operations
```

The web server process runs as a service user (`ctx-web`) with capability to `setuid`/`setgid` for file operations (or uses `sudo -u {user}` for reads/writes to preserve Unix permission semantics).

### 8.3 Pages and Routes

```
/                                   # Dashboard: recent activity, quick search
/home                               # My home: file browser for ~/
/home/contexts                      # My contexts list
/home/contexts/[...path]            # View/edit a context (markdown editor)
/home/logs                          # My agent logs list
/home/logs/[provider]               # Logs by provider
/home/logs/[provider]/[file]        # View a single transcript
/home/profile                       # View/edit my .profile/ documents
/home/pub                           # Manage my shared content
/team/[slug]                        # Team space browser
/team/[slug]/docs/[...path]         # Team document view/edit
/search                             # Full-text search
/admin                              # Admin: user list, team config, backups
/admin/users                        # User management
/admin/teams                        # Team management
/settings                           # SSH key management, provider connections
/settings/keys                      # Register/revoke SSH public keys
/settings/adapters                  # Configure ingestion adapters
```

### 8.4 Core UI Components

**File Browser** — A `ls`-like view with columns: name, modified, size, permissions. Click to navigate directories, click a `.md` file to open it.

**Markdown Editor** — CodeMirror-based editor for `.md` files with:
- Live preview (split pane)
- YAML frontmatter form (title, tags, sources, emoji, status)
- Auto-save (writes to filesystem, triggers git commit in contexts/)
- Syntax highlighting for markdown and code blocks

**Transcript Viewer** — Read-only viewer for agent logs:
- Conversation turns rendered as chat bubbles
- Collapsible tool calls and outputs
- Search within transcript
- "Create context from this conversation" action

**Search** — Single search bar with filters:
- Full-text search (backed by FTS index)
- Filter by: type (context, log, note), date range, provider, author
- Results show file path, snippet, modified date
- Click to open

**Profile Editor** — Form-based editor for `.profile/` documents:
- Structured fields (name, email, employer)
- Freeform markdown sections (bio, communication style)
- Card-based sections (projects, connections, decisions)

**Dashboard** — Landing page showing:
- Recently modified contexts
- Recent agent conversations (across all providers)
- Team activity feed (recent changes in `pub/` and `teams/`)
- Quick search

### 8.5 API Routes (Next.js Route Handlers)

All API routes operate on the filesystem. They are thin wrappers around `fs` operations executed as the authenticated user.

```
GET    /api/fs/[...path]           # Read a file or list a directory
PUT    /api/fs/[...path]           # Write a file (creates or overwrites)
DELETE /api/fs/[...path]           # Delete a file
PATCH  /api/fs/[...path]           # Partial update (sed-like replace)
POST   /api/fs/[...path]/mkdir     # Create a directory
POST   /api/fs/[...path]/mv        # Move/rename
GET    /api/search?q=...           # Full-text search
GET    /api/activity               # Recent changes across visible files
POST   /api/keys                   # Register SSH public key
DELETE /api/keys/[fingerprint]     # Revoke SSH public key
GET    /api/user                   # Current user metadata
POST   /api/provision              # Trigger user provisioning (internal)
```

### 8.6 Real-time Updates

The web app uses Server-Sent Events (SSE) backed by `inotifywait` on the user's home directory and visible team directories. When a file changes (e.g., an agent writes a new log via SSH), the browser updates live.

```
GET /api/events → SSE stream of file change events
```

---

## 9. CLI Tool

### 9.1 Overview

The `ctx` CLI is a thin convenience wrapper. For most operations it simply executes SSH commands. It adds ergonomics for common patterns but never hides the fact that SSH and standard tools are the real interface.

```bash
# Installation
npm install -g @ctx/cli
# or
brew install ctx

# Configuration
ctx init   # prompts for host, writes ~/.ctxrc
```

### 9.2 Commands

```bash
# Navigation and reading — thin SSH wrappers
ctx ls [path]                          # ssh ctx ls -la {path}
ctx cat <path>                         # ssh ctx cat {path}
ctx tree [path]                        # ssh ctx find {path} -type f | tree --fromfile
ctx search <query>                     # ssh ctx ctx-search {query}

# Writing
ctx edit <path>                        # opens $EDITOR on a local temp copy,
                                       #   syncs back on save via scp
ctx new context <title>                # scaffolds a new context .md with frontmatter
ctx new log <provider>                 # scaffolds a new log .md
ctx mv <src> <dst>                     # ssh ctx mv {src} {dst}
ctx rm <path>                          # ssh ctx rm {path}

# Sharing
ctx share <path>                       # cp to pub/, set group permissions
ctx unshare <path>                     # rm from pub/
ctx acl <path> <user> <perms>          # setfacl wrapper

# Profile
ctx profile                            # cat .profile/*
ctx profile edit <section>             # edit a profile section

# Keys
ctx keys add <path-to-pubkey>          # register SSH key via web API
ctx keys list                          # list registered keys
ctx keys revoke <fingerprint>          # revoke a key

# Agent helpers
ctx ingest <provider> <file>           # manually ingest a conversation log
ctx latest [provider]                  # show most recent log(s)
ctx context-from <log-path>            # scaffold a context from a conversation

# Meta
ctx status                             # connection check, user info, disk usage
ctx sync                               # rsync mirror to local cache
```

### 9.3 Agent Integration

Agents don't need the CLI. They SSH directly:

```bash
# In a Claude Code system prompt or tool definition:
ssh ctx.company.com cat contexts/project-plan.md
ssh ctx.company.com grep -rl "authentication" contexts/
ssh ctx.company.com 'rg "decided to use" logs/claude-code/ | tail -5'
```

For agents that can't SSH (browser-based, sandboxed), the web API provides equivalent access.

---

## 10. Daemons

### 10.1 ctx-indexd (Search Indexer)

```
Watches /srv/ctx/ via inotify for .md file changes.
On change: parse frontmatter + body, upsert into SQLite FTS5 index.
Index location: /srv/ctx/var/search/index.db

Search query interface:
  ctx-search <query> [--type TYPE] [--since DATE] [--until DATE]
              [--author USER] [--limit N]

Returns: file path, frontmatter metadata, matching snippet, relevance score.
```

The index is **derived and disposable**. `ctx-reindex` rebuilds it from scratch by walking the filesystem.

### 10.2 ctx-gitd (Auto-Commit Daemon)

```
For each user's contexts/ directory:
  - Watches for changes via inotify
  - Debounces (30 second quiet period)
  - Runs: cd /srv/ctx/home/{user}/contexts && git add -A && git commit -m "auto: {summary}"
  - The commit message summarizes which files changed

Does NOT track logs/ (immutable, append-only).
Does NOT track notes/ (synced from external sources).
```

### 10.3 ctx-ingestd (Ingestion Adapters)

Modular adapter framework. Each adapter is an independent process:

```
/srv/ctx/var/ingest/
├── claude-code/        # adapter state (last-sync cursor, tokens)
├── claude-chat/
├── chatgpt/
├── codex/
└── cursor/
```

Adapter contract:

1. Poll or webhook-receive new conversations from the provider
2. Convert to markdown with YAML frontmatter (per §5.3 format)
3. Write atomically to `/srv/ctx/home/{user}/logs/{provider}/{timestamp}.md`
   - Write to a temp file first, then `mv` (atomic on same filesystem)
4. Touch `/srv/ctx/var/search/.reindex-needed` to trigger indexing
5. Set file ownership to the user (`chown {user}:{user}`)

Adapters for initial release:

| Adapter | Source | Method |
|---|---|---|
| `claude-code` | Claude Code sessions | CLI export or API |
| `claude-chat` | Claude.ai conversations | API |
| `chatgpt` | ChatGPT conversations | API / export |
| `codex` | OpenAI Codex sessions | API |
| `obsidian` | Obsidian vault | rsync from user's machine / Obsidian Sync API |
| `granola` | Granola meeting notes | API |

Users configure adapters via the web UI (`/settings/adapters`), which writes config files that the adapter daemons read.

### 10.4 ctx-backupd (Backup Daemon)

```
Daily: snapshot /srv/ctx/home/ and /srv/ctx/teams/ to S3
  - Incremental (rsync-style, only changed files)
  - Encrypted at rest (S3 SSE-KMS)
  - Retained: 30 daily, 12 monthly, indefinite yearly

EBS snapshots: daily, automated via AWS DLM policy
```

---

## 11. User Stories

### 11.1 Individual User

**US-1.1: First login and provisioning**
> As a new team member, when I log in to ctx via my company SSO for the first time, my personal filesystem is automatically created with the standard directory structure and my profile is pre-populated from my Cognito claims, so I can start using ctx immediately without any setup.

**US-1.2: Browse my contexts**
> As a user, I can navigate my `contexts/` directory in the web UI or via `ssh ctx ls contexts/` to see all my saved knowledge documents organized in folders.

**US-1.3: Create a context**
> As a user, I can create a new markdown context document via the web editor (with frontmatter form) or via SSH (`echo '...' > contexts/new-topic.md`), and it is immediately searchable and git-tracked.

**US-1.4: Edit a context**
> As a user, I can edit a context in the web markdown editor with live preview, or via `ssh ctx vim contexts/topic.md` (or `ctx edit contexts/topic.md` locally), and changes are auto-committed to git.

**US-1.5: View my agent logs**
> As a user, I can browse my conversation logs organized by provider and date, view a single transcript in a chat-like format, and search across all my logs.

**US-1.6: Search across everything**
> As a user, I can search across all my contexts, logs, notes, and profile with a single query. Results show the file path, a snippet, and metadata. I can filter by type, date, and provider.

**US-1.7: View version history**
> As a user, I can view the git history of any context document, see diffs between versions, and restore a previous version.

**US-1.8: Manage my profile**
> As a user, I can view and edit my `.profile/` documents to maintain structured information about myself — identity, bio, projects, connections, decisions, expertise.

**US-1.9: Register SSH keys**
> As a user, I can register one or more SSH public keys via the web UI so that I (and my agents) can access ctx via SSH.

**US-1.10: Use ctx from any agent**
> As a user running Claude Code, Codex, Cursor, or any CLI-capable agent, I can `ssh ctx.company.com cat contexts/topic.md` to read my context, or `ssh ctx.company.com grep -r "keyword" logs/` to search — with no SDK, no API key, no client library.

### 11.2 Team Collaboration

**US-2.1: Share a context with my team**
> As a user, I can copy a context to my `pub/contexts/` directory (or use `ctx share`) to make it readable by my team, so teammates and their agents can access my shared knowledge.

**US-2.2: Browse teammates' shared content**
> As a user, I can browse the `pub/` directories of my teammates to see what they've shared, either in the web UI or via `ssh ctx ls /srv/ctx/home/tiger/pub/`.

**US-2.3: Fine-grained sharing with ACLs**
> As a user, I can share a specific file or directory with a specific teammate (not the whole team) using POSIX ACLs, via the web UI or `ctx acl contexts/secret-brief.md tiger r`.

**US-2.4: Team shared space**
> As a team member, I can read and write documents in `/srv/ctx/teams/{team}/` which is shared with everyone in the team group, for truly collaborative documents.

**US-2.5: See team activity**
> As a user, I can see a feed of recent changes across my team's shared content — who modified what, when — in the web dashboard.

**US-2.6: View a teammate's profile**
> As a teammate, I can read another team member's `.profile/` documents (which are group-readable by default) to understand their role, projects, and expertise before collaborating.

### 11.3 Agent-Specific

**US-3.1: Agent reads user context before responding**
> As an AI agent, at the start of a session I can `ssh ctx cat .profile/identity.md .profile/projects.md` to understand who I'm working with and what they're working on.

**US-3.2: Agent searches prior conversations**
> As an AI agent, when the user asks "what did I decide about X", I can `ssh ctx rg "X" logs/ contexts/` to find relevant prior conversations and decisions.

**US-3.3: Agent writes back knowledge**
> As an AI agent, after a substantive conversation, I can write a new context document: `ssh ctx 'cat > contexts/new-insight.md << EOF ... EOF'` to preserve durable knowledge.

**US-3.4: Agent logs are automatically ingested**
> As a user, my conversations with AI agents are automatically ingested into `logs/{provider}/` as markdown files by the ingestion adapters, without any manual action.

**US-3.5: Agent accesses team context**
> As an AI agent running on behalf of a user, I can read shared team documents in `pub/` directories and `teams/` spaces, with access governed by the user's Unix permissions.

### 11.4 Administration

**US-4.1: Deploy ctx for my company**
> As a DevOps engineer, I can deploy ctx into my AWS account with `npx sst deploy`, pointing it at our existing Cognito user pool, and have a working system in under 30 minutes.

**US-4.2: Manage teams**
> As an admin, I can create teams, add/remove members, and optionally sync team membership from Cognito groups, via the web admin UI.

**US-4.3: Monitor usage**
> As an admin, I can see disk usage per user, number of documents, index size, and backup status in the admin dashboard.

**US-4.4: Restore from backup**
> As an admin, I can restore individual user directories or the entire system from S3 backups.

**US-4.5: Scale storage**
> As an admin, I can grow the EBS volume online without downtime when the team needs more storage.

---

## 12. Milestones

### M0: Foundation (Weeks 1–3)

- [ ] SST stack: VPC, EC2, EBS, ALB, security groups, NLB for SSH
- [ ] Bootstrap script: filesystem layout, SSH config, user provisioning
- [ ] Cognito integration: OIDC flow via ALB, claims extraction
- [ ] User provisioning: first-login creates Unix user + home directory
- [ ] Basic web app: auth, file browser (read-only), user profile view

### M1: Core Read/Write (Weeks 4–6)

- [ ] Web markdown editor (CodeMirror, frontmatter form, auto-save)
- [ ] Transcript viewer (chat-bubble rendering)
- [ ] SSH key management (register, list, revoke via web UI)
- [ ] ctx-gitd (auto-commit daemon for contexts/)
- [ ] ctx CLI tool (thin SSH wrapper)
- [ ] File operations API (read, write, delete, mkdir, mv)

### M2: Search & Indexing (Weeks 7–8)

- [ ] ctx-indexd (inotify-based FTS indexer, SQLite FTS5)
- [ ] Search UI (query, filters, results)
- [ ] Search API route
- [ ] `ctx-search` CLI command on host

### M3: Ingestion (Weeks 9–11)

- [ ] Adapter framework (contract, config, state management)
- [ ] Claude Code adapter
- [ ] Claude Chat adapter
- [ ] ChatGPT adapter (export-based)
- [ ] Obsidian sync adapter
- [ ] Adapter configuration via web UI

### M4: Teams & Sharing (Weeks 12–13)

- [ ] Team provisioning (groups, shared directories)
- [ ] Cognito group sync
- [ ] pub/ sharing workflow (web + CLI)
- [ ] ACL management (web + CLI)
- [ ] Team space browser
- [ ] Activity feed

### M5: Polish & Hardening (Weeks 14–16)

- [ ] Backup daemon + S3 integration
- [ ] Admin dashboard (users, usage, backups)
- [ ] EBS snapshot automation (DLM)
- [ ] Version history UI (git log, diff, restore)
- [ ] SSE real-time updates
- [ ] Rate limiting, audit logging
- [ ] Documentation, README, deployment guide
- [ ] Open-source release

### Stretch: Semantic Search

- [ ] Embedding sidecar daemon
- [ ] Hybrid search (FTS + semantic)
- [ ] "Create context from these sources" with LLM synthesis

---

## 13. Non-Functional Requirements

### 13.1 Performance

| Metric | Target |
|---|---|
| SSH command latency (cat, ls) | < 100ms (network + filesystem) |
| Web page load | < 1s (TTFB < 200ms) |
| Search query (FTS) | < 500ms for 100k documents |
| File write acknowledgment | < 200ms |
| Ingestion lag | < 5 minutes from provider to filesystem |

### 13.2 Scale

| Dimension | Initial Target | Notes |
|---|---|---|
| Users per deployment | Up to 500 | Single EC2 instance |
| Documents per user | Up to 50,000 | Mostly small .md files |
| Total storage | Up to 500 GB | EBS gp3, expandable |
| Concurrent SSH sessions | Up to 100 | OpenSSH default limits |
| Concurrent web users | Up to 200 | Next.js on t3.medium |

### 13.3 Security

- All data encrypted at rest (EBS encryption, S3 SSE-KMS)
- All data encrypted in transit (SSH, HTTPS via ALB)
- Unix permissions enforced at kernel level — no application-level bypass possible
- No IAM credentials on disk; instance role for S3/EBS access
- SSH access optionally restricted to VPN CIDR
- Audit log of all file modifications (via inotify + syslog)
- Short-lived SSH certificates preferred over permanent keys

### 13.4 Reliability

- EBS data survives instance termination
- Daily EBS snapshots (30-day retention)
- Daily S3 backups (cross-region optional)
- Instance auto-recovery via ASG (min=max=1)
- Monitoring: CloudWatch metrics for disk, CPU, SSH connections

### 13.5 Cost Estimate

| Resource | Spec | Monthly Cost |
|---|---|---|
| EC2 t3.medium | 2 vCPU, 4 GB RAM | ~$30 |
| EBS gp3 100 GB | Encrypted | ~$8 |
| ALB | HTTPS termination | ~$22 |
| NLB | SSH passthrough | ~$22 |
| S3 backups | ~50 GB | ~$1 |
| Data transfer | ~50 GB/mo | ~$5 |
| **Total** | | **~$88/month** |

For a team of 20–100 people, this is approximately **$1–4/user/month**.

---

## 14. Open Questions

1. **EFS vs. EBS:** For larger deployments, should the filesystem live on EFS (shared across instances) instead of EBS? EFS adds latency but enables horizontal scaling and simpler failover.

2. **Container vs. bare EC2:** Should ctx-host be a Docker container on ECS/Fargate instead of bare EC2? Containers simplify deployment but complicate SSH access and Unix user management.

3. **SSH certificate authority:** Should we build SSH CA support into M0, or start with authorized_keys and add certificates later?

4. **Log immutability:** Should `logs/` directories be mounted read-only (bind mount with `ro` option) after ingestion, or is `chmod 444` sufficient?

5. **Multi-region:** For globally distributed teams, should we support multi-region deployment with cross-region sync? Or is a single region sufficient for v1?

6. **Quotas:** Should there be per-user disk quotas? Unix supports this natively (`edquota`), but it adds operational complexity.

7. **Semantic search priority:** Is FTS5 sufficient for v1, or is semantic search a launch requirement?
