# ctx — Progress Log

## Project Overview
**ctx** is an open-source, Unix-native context layer for AI-augmented teams. It provides a shared filesystem of markdown documents — contexts, conversation logs, notes, and profiles — backed by real Unix permissions, real files, and real directories on a remote Linux server.

- **Repository:** `ctx-project/`
- **Live URL:** https://ctx.superbuilders.social
- **SSH Host:** ssh.ctx.superbuilders.social (EIP: 100.50.129.228)
- **AWS Account:** 565944437804 (profile: `superbuilders-prod`)
- **Stage:** `production`

---

## M0: Foundation — COMPLETED ✅ (July 9, 2026)

### What Was Built

#### Infrastructure (SST v3 on AWS)
- **VPC:** Reusing default VPC (`vpc-096e7c1841411c42d`) — account has 90+ VPCs hitting the limit
- **EC2 Instance:** `t3.medium` Ubuntu 24.04 (`i-0c64fedd2a914cad9`) in `us-east-1a`
- **EBS Volume:** 100GB gp3 encrypted, mounted at `/srv/ctx`
- **Elastic IP:** `100.50.129.228` for stable SSH access
- **ALB:** HTTPS termination with ACM cert for `ctx.superbuilders.social`
- **ACM Certificate:** Auto-validated via Route53 DNS
- **Route53 DNS:**
  - `ctx.superbuilders.social` → ALB (web access)
  - `ssh.ctx.superbuilders.social` → EIP (SSH access)
- **S3 Bucket:** `ctx-production-ctxbackupsbucket-ofbzfatk` for backups
- **Cognito User Pool:** `ctx-production` (`us-east-1_MykT9xxku`)
  - Client ID: `5ja32379nqq34g104evnvphcs1`
  - Hosted UI domain: `ctx-app-production.auth.us-east-1.amazoncognito.com`
- **Security Groups:** ALB (443/80 public), EC2 (22 public, 3000 from ALB)
- **IAM Role:** EC2 instance role with SSM, S3, and CloudWatch access

#### Filesystem (on EC2)
- `/srv/ctx/home/{user}/` — per-user home directories
- `/srv/ctx/home/{user}/.profile/` — structured identity documents (identity, bio, projects, expertise, connections, decisions)
- `/srv/ctx/home/{user}/contexts/` — git-tracked knowledge artifacts
- `/srv/ctx/home/{user}/logs/{provider}/` — agent conversation transcripts
- `/srv/ctx/home/{user}/notes/` — synced external notes
- `/srv/ctx/home/{user}/pub/` — shared content (group-readable)
- `/srv/ctx/teams/` — team shared spaces
- `/srv/ctx/var/` — system data (search, ingest, backups, log, keys)

#### User Provisioning
- `/usr/local/bin/ctx-provision` — creates Unix user, home directory, .profile/ documents, contexts/ git repo, SSH keys directory
- `/usr/local/bin/ctx-ssh-keys` — AuthorizedKeysCommand for OpenSSH
- User mapping: Cognito `sub` → Unix username via `/srv/ctx/var/user-map.json`

#### Web Application (Next.js 15)
- **Auth:** NextAuth v5 with Cognito OIDC provider
- **Pages:**
  - `/` — Dashboard with getting started guide and quick reference
  - `/home` — File browser (ls-like view of user's home directory)
  - `/home/contexts` — Contexts list with "New Context" button
  - `/home/contexts/[...path]` — Context viewer (markdown rendering with frontmatter)
  - `/home/logs` — Agent logs organized by provider (Claude Code, Claude Chat, ChatGPT, Codex, Cursor)
  - `/home/profile` — Profile viewer showing all .profile/ sections
  - `/search` — Full-text search (backed by ripgrep)
  - `/auth/signin` — Custom sign-in page
- **API Routes:**
  - `GET/PUT/DELETE/POST /api/fs/[...path]` — Filesystem operations
  - `GET /api/search?q=...` — Search
  - `GET /api/health` — Health check
  - `GET/POST /api/auth/[...nextauth]` — Auth handlers
- **Components:** Sidebar, Header, FileBrowser, MarkdownViewer, ProfileCard
- **Styling:** Tailwind CSS v4 with custom dark theme (`ctx-bg`, `ctx-surface`, `ctx-accent`, etc.)

#### Deploy Infrastructure
- `scripts/deploy-web.sh` — Build Next.js standalone → rsync to EC2 → restart service
- `scripts/provision-user.sh` — Standalone provisioning script
- `scripts/ctx-ssh-keys.sh` — SSH key lookup script
- systemd service `ctx-web` running at `/opt/ctx-web/app/`
- Environment config at `/opt/ctx-web/.env`

### Bugs Fixed During Build

1. **VPC Limit:** Account had 90+ VPCs. Switched from `new sst.aws.Vpc()` to `sst.aws.Vpc.get()` referencing the default VPC.

2. **Bash `${...}` in `$interpolate`:** Bash parameter expansion syntax `${3:-$USERNAME}` conflicted with JS template literal interpolation inside SST's `$interpolate`. Fixed by using `$3` + fallback pattern.

3. **SSH service name:** Ubuntu 24.04 uses `ssh.service` not `sshd.service`. Bootstrap script failed at step 6. Fixed in user-data.

4. **`.profile` file/directory conflict:** `useradd -m` copies `/etc/skel/.profile` (a file), conflicting with our `.profile/` directory. Fixed by using `useradd -M` (no skeleton) in provisioning script.

5. **Static assets missing:** Next.js standalone build doesn't include `.next/static/` automatically. Need to copy `cp -r .next/static .next/standalone/packages/web/.next/static` before deploying.

6. **Middleware blocking auth callback:** The middleware matcher excluded `auth/*` but not `api/auth/*`, causing the Cognito OIDC callback to be redirected to sign-in. Fixed matcher pattern.

7. **Standalone server.js path:** Next.js in a monorepo puts `server.js` at `packages/web/server.js` inside standalone, not at the root. Fixed systemd `WorkingDirectory`.

8. **EC2 KeyPair resource:** `aws.ec2.KeyPair` without `publicKey` fails. Removed unused resource; using SSM Session Manager for admin access.

### Design Decisions

- **No ALB-level Cognito auth:** Using app-level auth (NextAuth) instead of ALB authentication actions. Simpler, more flexible, and doesn't require ALB-specific setup.
- **Standalone Next.js:** Using `output: "standalone"` for self-contained deployment on EC2. No need for `node_modules` on the server.
- **Root process for web app:** The ctx-web service runs as root to enable filesystem access across all user directories. Unix permissions are still enforced at the kernel level.
- **EIP for SSH:** Direct SSH via Elastic IP rather than NLB. Simpler and cheaper for M0.
- **SSM for admin access:** No SSH key pair on the EC2 instance. Admin access via AWS SSM Session Manager.

---

## What's Next: M1 (Core Read/Write)

Per the PRD milestones:
- [ ] Web markdown editor (CodeMirror, frontmatter form, auto-save)
- [ ] Transcript viewer (chat-bubble rendering for agent logs)
- [ ] SSH key management (register, list, revoke via web UI)
- [ ] ctx-gitd (auto-commit daemon for contexts/)
- [ ] ctx CLI tool (thin SSH wrapper)
- [ ] Complete file operations (move, rename)

## Key Files

| File | Purpose |
|------|---------|
| `sst.config.ts` | All AWS infrastructure (VPC, EC2, EBS, ALB, Cognito, Route53, S3) |
| `packages/web/src/lib/auth.ts` | NextAuth config with Cognito OIDC |
| `packages/web/src/lib/fs.ts` | Filesystem operations (list, read, write, search) |
| `packages/web/src/middleware.ts` | Auth middleware protecting all routes |
| `packages/web/src/app/page.tsx` | Dashboard page |
| `scripts/deploy-web.sh` | Web app deployment script |
| `scripts/provision-user.sh` | User provisioning script |
