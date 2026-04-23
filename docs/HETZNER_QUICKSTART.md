# Hetzner VPS Quickstart — LaunchOps Founder Edition

**Target:** Ubuntu 22.04 LTS on Hetzner Cloud, running the full LaunchOps stack via Docker Compose with automated GitHub Actions deploys on every push to `master`.

---

## 1. Recommended Server Spec

| Parameter | Recommendation | Notes |
|---|---|---|
| **Server type** | CX41 (4 vCPU, 16 GB RAM) | Minimum for all 6 containers + API. CX31 (8 GB) works for testing only. |
| **OS image** | Ubuntu 22.04 LTS | Select under "OS Images" during creation. |
| **Location** | Ashburn (US-East) or Falkenstein (EU) | Pick closest to your audience. |
| **Networking** | Public IPv4 + IPv6 | Enable both. IPv4 costs €0.001/hr extra. |
| **Backups** | Enable (20% surcharge) | Strongly recommended before first live deploy. |
| **Firewall** | Create new (see §5) | Attach during server creation. |

**Estimated cost:** ~€17–22/month for CX41 with backups.

---

## 2. SSH Key Setup

Before creating the server, add your SSH public key to Hetzner so you can authenticate without a password.

**On your local machine**, generate a dedicated deploy key:

```bash
ssh-keygen -t ed25519 -C "launchops-deploy" -f ~/.ssh/launchops_deploy
# Press Enter twice for no passphrase (required for GitHub Actions)
```

This creates two files:
- `~/.ssh/launchops_deploy` — **private key** (goes into GitHub Secret `VPS_SSH_KEY`)
- `~/.ssh/launchops_deploy.pub` — **public key** (goes into Hetzner)

**In Hetzner Cloud Console:**
1. Go to **Security → SSH Keys → Add SSH Key**
2. Paste the contents of `~/.ssh/launchops_deploy.pub`
3. Name it `launchops-deploy`
4. Select it when creating the server

**Test the connection** after server creation:

```bash
ssh -i ~/.ssh/launchops_deploy root@<YOUR_SERVER_IP>
```

---

## 3. Create the Server

1. In Hetzner Cloud Console, click **Create Server**
2. Select: **Location** → your choice, **Image** → Ubuntu 22.04, **Type** → CX41
3. Under **SSH Keys**, select `launchops-deploy`
4. Under **Firewalls**, select the firewall you created in §5 (or create after)
5. Under **Name**, enter `launchops-vps`
6. Click **Create & Buy Now**

Note the **public IPv4 address** — this is your `VPS_HOST` secret.

---

## 4. Initial Server Configuration

SSH into the server as root:

```bash
ssh -i ~/.ssh/launchops_deploy root@<YOUR_SERVER_IP>
```

Run the full setup sequence:

```bash
# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y git curl wget unzip tmux htop ufw fail2ban

# Install Docker (official script)
curl -fsSL https://get.docker.com | sh

# Add root to docker group (already root, but good practice if using ubuntu user)
usermod -aG docker $USER

# Install Docker Compose plugin (v2 — uses 'docker compose' not 'docker-compose')
apt install -y docker-compose-plugin

# Verify installations
docker --version
docker compose version
```

Expected output:
```
Docker version 26.x.x, build ...
Docker Compose version v2.x.x
```

---

## 5. Firewall Rules (UFW)

Configure UFW to allow only the ports the stack needs:

```bash
# Reset to defaults
ufw default deny incoming
ufw default allow outgoing

# SSH (critical — do this first or you'll lock yourself out)
ufw allow 22/tcp

# HTTP and HTTPS (Nginx reverse proxy)
ufw allow 80/tcp
ufw allow 443/tcp

# LaunchOps FastAPI (direct access, before Nginx is configured)
ufw allow 8001/tcp

# LaunchOps Dashboard (React/Vite dev server)
ufw allow 5173/tcp

# Enable firewall
ufw --force enable
ufw status verbose
```

**Also configure in Hetzner Cloud Console** (Hetzner's own firewall sits in front of UFW):

1. Go to **Firewalls → Create Firewall**
2. Add **Inbound** rules:

| Protocol | Port | Source | Purpose |
|---|---|---|---|
| TCP | 22 | Any | SSH |
| TCP | 80 | Any | HTTP |
| TCP | 443 | Any | HTTPS |
| TCP | 8001 | Any | LaunchOps API |
| TCP | 5173 | Any | Dashboard (dev) |
| ICMP | — | Any | Ping |

3. Attach the firewall to your `launchops-vps` server.

> **Note:** The individual service ports (8080–8083, 8000) are intentionally **not** exposed publicly. They are accessed through Nginx reverse proxy on 80/443 once you configure SSL. During initial setup you can temporarily open them for testing, but close them before going live.

---

## 6. Clone the Repository

```bash
# Create deploy directory
mkdir -p /opt/launchops
cd /opt/launchops

# Clone the repo
git clone https://github.com/MicroAIStudios-DAO/launchops-founder-edition.git .

# Verify
ls -la
```

---

## 7. Configure Environment Variables

Create the `.env` file from the example:

```bash
cp .env.example .env
nano .env
```

Fill in all required values:

```dotenv
# LLM Provider
OPENAI_API_KEY=sk-...your-key-here...

# Database credentials (choose strong passwords)
DB_PASSWORD=choose_a_strong_password_here
DB_ROOT_PASSWORD=choose_a_different_root_password

# Vaultwarden admin panel token
# Generate with: openssl rand -base64 48
VAULT_ADMIN_TOKEN=your_generated_token_here
```

Save and close (`Ctrl+X`, `Y`, `Enter` in nano).

---

## 8. First Manual Deploy

Run the stack for the first time manually to verify everything works before enabling automated deploys:

```bash
cd /opt/launchops

# Pull all Docker images (takes 3–5 minutes on first run)
docker compose pull

# Start all services in detached mode
docker compose up -d

# Watch logs to confirm startup
docker compose logs -f --tail=50
```

Press `Ctrl+C` to stop following logs. Check service status:

```bash
docker compose ps
```

Expected output (all services `Up`):

```
NAME                    STATUS          PORTS
launchops_db            Up              3306/tcp
launchops_wordpress     Up              0.0.0.0:8080->80/tcp
launchops_suitecrm      Up              0.0.0.0:8081->8080/tcp
launchops_mautic        Up              0.0.0.0:8082->80/tcp
launchops_matomo        Up              0.0.0.0:8083->80/tcp
launchops_vaultwarden   Up              0.0.0.0:8000->80/tcp
```

**Start the LaunchOps API** (in a tmux session so it persists after SSH disconnect):

```bash
tmux new-session -s launchops

cd /opt/launchops
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m api.main
# API is now running at http://<YOUR_IP>:8001
```

Press `Ctrl+B` then `D` to detach from tmux. The API keeps running.

**Verify the API health endpoint:**

```bash
curl http://localhost:8001/health
# Expected: {"status":"ok","pipeline":"ready",...}
```

---

## 9. Configure GitHub Secrets

In the GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add each of the following:

| Secret Name | Value | Description |
|---|---|---|
| `VPS_HOST` | `<your Hetzner IPv4>` | Public IP address of the Hetzner server |
| `VPS_USER` | `root` | SSH login user (root for Hetzner default) |
| `VPS_SSH_KEY` | Contents of `~/.ssh/launchops_deploy` | Full private key including `-----BEGIN...` and `-----END...` lines |
| `VPS_DEPLOY_PATH` | `/opt/launchops` | Absolute path to the repo on the VPS |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key for LLM agents |
| `DB_PASSWORD` | `your_db_password` | MariaDB user password (match what's in .env) |
| `DB_ROOT_PASSWORD` | `your_root_password` | MariaDB root password (match what's in .env) |
| `VAULT_ADMIN_TOKEN` | `your_vault_token` | Vaultwarden admin panel token |

> **Security note:** Never commit `.env` to the repository. The deploy workflow writes it fresh from secrets on every deploy, ensuring secrets never touch the git history.

---

## 10. Trigger Automated Deploy

Once secrets are configured, every push to `master` triggers an automated deploy. To trigger manually:

```bash
# From your local machine
git push origin master
```

Or go to **Actions → Deploy to Hetzner VPS → Run workflow** in the GitHub UI.

Watch the deploy in **Actions → Deploy to Hetzner VPS → latest run**. The workflow will:

1. Validate all secrets are present
2. SSH into the VPS
3. Write the `.env` file from secrets
4. `git reset --hard origin/master`
5. `docker compose pull && docker compose up -d --remove-orphans`
6. Wait 15 seconds, then run health checks on all 6 services
7. Print a container status table

Total deploy time: approximately 2–4 minutes.

---

## 11. Service Access URLs

After deploy, your services are accessible at:

| Service | URL | Notes |
|---|---|---|
| LaunchOps API | `http://<IP>:8001` | FastAPI + Swagger at `/docs` |
| WordPress | `http://<IP>:8080` | Site + course platform |
| SuiteCRM | `http://<IP>:8081` | CRM pipeline |
| Mautic | `http://<IP>:8082` | Email automation |
| Matomo | `http://<IP>:8083` | Analytics |
| Vaultwarden | `http://<IP>:8000` | Credential vault |

---

## 12. Next Steps: SSL + Custom Domain

Once the stack is confirmed working, add Nginx as a reverse proxy with Let's Encrypt SSL:

```bash
apt install -y nginx certbot python3-certbot-nginx

# Point your domain DNS A record to <YOUR_SERVER_IP> first, then:
certbot --nginx -d yourdomain.com -d api.yourdomain.com

# Nginx config lives at:
# /etc/nginx/sites-available/launchops
```

See `docs/HETZNER_SETUP.md` for the full Nginx configuration with SSL and subdomain routing.

---

*Built by TheSolopreneur.AI — the founder's war room is always open.*
