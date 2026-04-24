# DigitalOcean Droplet Quickstart — LaunchOps Founder Edition

**Target:** Ubuntu 22.04 LTS on a DigitalOcean Droplet, running the full LaunchOps stack via Docker Compose with automated GitHub Actions deploys on every push to `master`.

**Why DigitalOcean?** Instant signup with a credit card — no identity verification, no waiting period. Droplets are live in under 60 seconds. The $24/month Premium AMD Droplet (4 vCPU / 8 GB RAM) comfortably runs all 6 containers plus the LaunchOps API, and DigitalOcean's control panel is the cleanest in the industry. Vultr and Linode are solid alternatives with identical setup steps — this guide works for all three.

---

## 1. Recommended Droplet Spec

| Parameter | Recommendation | Notes |
|---|---|---|
| **Plan** | Premium AMD — 4 vCPU / 8 GB RAM | ~$24/month. Handles all 6 containers + API comfortably. |
| **OS image** | Ubuntu 22.04 LTS x64 | Select under "Choose an image → OS". |
| **Region** | New York 3 or San Francisco 3 | Pick closest to your audience. |
| **Authentication** | SSH Key (add during creation) | See §2 below. |
| **Backups** | Enable (20% surcharge, ~$5/mo) | Strongly recommended before first live deploy. |
| **Firewall** | Create via Networking → Firewalls | See §5 for rules. |

**Estimated cost:** ~$24–29/month with backups enabled.

---

## 2. SSH Key Setup

Generate a dedicated deploy key on your local machine before creating the Droplet:

```bash
ssh-keygen -t ed25519 -C "launchops-deploy" -f ~/.ssh/launchops_deploy
# Press Enter twice for no passphrase (required for GitHub Actions automation)
```

This creates two files:

- `~/.ssh/launchops_deploy` — **private key** (paste into GitHub Secret `VPS_SSH_KEY`)
- `~/.ssh/launchops_deploy.pub` — **public key** (add to DigitalOcean)

**In DigitalOcean control panel:**

1. Go to **Settings → Security → SSH Keys → Add SSH Key**
2. Paste the contents of `~/.ssh/launchops_deploy.pub`
3. Name it `launchops-deploy`
4. Select it when creating the Droplet

**Test the connection** after Droplet creation:

```bash
ssh -i ~/.ssh/launchops_deploy root@<YOUR_DROPLET_IP>
```

---

## 3. Create the Droplet

1. In the DigitalOcean control panel, click **Create → Droplets**
2. **Region:** your choice
3. **Image:** Ubuntu 22.04 LTS x64
4. **Size:** Premium AMD → 4 vCPU / 8 GB RAM (~$24/mo)
5. **Authentication:** SSH Key → select `launchops-deploy`
6. **Hostname:** `launchops-vps`
7. Click **Create Droplet**

The Droplet will be live in under 60 seconds. Note the **public IPv4 address** — this is your `VPS_HOST` secret.

---

## 4. Initial Server Configuration

SSH into the Droplet:

```bash
ssh -i ~/.ssh/launchops_deploy root@<YOUR_DROPLET_IP>
```

Run the full setup sequence:

```bash
# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y git curl wget unzip tmux htop ufw fail2ban

# Install Docker (official script — works on Ubuntu 22.04)
curl -fsSL https://get.docker.com | sh

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

## 5. Firewall Rules (UFW + DigitalOcean)

**Configure UFW on the Droplet:**

```bash
# Reset to defaults
ufw default deny incoming
ufw default allow outgoing

# SSH — do this first or you'll lock yourself out
ufw allow 22/tcp

# HTTP and HTTPS (Nginx reverse proxy)
ufw allow 80/tcp
ufw allow 443/tcp

# LaunchOps FastAPI (direct access before Nginx is configured)
ufw allow 8001/tcp

# LaunchOps Dashboard (React/Vite dev server)
ufw allow 5173/tcp

# Enable firewall
ufw --force enable
ufw status verbose
```

**Also configure a DigitalOcean Cloud Firewall** (sits in front of UFW, blocks at the network edge):

1. Go to **Networking → Firewalls → Create Firewall**
2. Add **Inbound** rules:

| Protocol | Port | Source | Purpose |
|---|---|---|---|
| TCP | 22 | All IPv4, All IPv6 | SSH |
| TCP | 80 | All IPv4, All IPv6 | HTTP |
| TCP | 443 | All IPv4, All IPv6 | HTTPS |
| TCP | 8001 | All IPv4, All IPv6 | LaunchOps API |
| TCP | 5173 | All IPv4, All IPv6 | Dashboard (dev) |
| ICMP | — | All IPv4, All IPv6 | Ping |

3. Under **Apply to Droplets**, select `launchops-vps`
4. Click **Create Firewall**

> **Note:** Individual service ports (8080–8083, 8000) are intentionally **not** exposed publicly. They are accessed through Nginx reverse proxy on 80/443 once SSL is configured. You may temporarily open them for initial testing, but close them before going live.

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

```bash
cp .env.example .env 2>/dev/null || touch .env
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

**Start the LaunchOps API** in a persistent tmux session:

```bash
tmux new-session -s launchops

cd /opt/launchops
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m api.main
# API now running at http://<YOUR_IP>:8001
```

Press `Ctrl+B` then `D` to detach from tmux. The API keeps running after you disconnect.

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
| `VPS_HOST` | `<your Droplet IPv4>` | Public IP address of the Droplet |
| `VPS_USER` | `root` | SSH login user (DigitalOcean default) |
| `VPS_SSH_KEY` | Contents of `~/.ssh/launchops_deploy` | Full private key including `-----BEGIN...` and `-----END...` lines |
| `VPS_DEPLOY_PATH` | `/opt/launchops` | Absolute path to the repo on the Droplet |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key for LLM agents |
| `DB_PASSWORD` | `your_db_password` | MariaDB user password |
| `DB_ROOT_PASSWORD` | `your_root_password` | MariaDB root password |
| `VAULT_ADMIN_TOKEN` | `openssl rand -base64 48` output | Vaultwarden admin panel token |

> **Security note:** Never commit `.env` to the repository. The deploy workflow writes it fresh from secrets on every deploy, ensuring credentials never touch the git history.

---

## 10. Trigger Automated Deploy

Once secrets are configured, every push to `master` triggers an automated deploy. To trigger manually:

```bash
# From your local machine
git push origin master
```

Or go to **Actions → Deploy to DigitalOcean Droplet → Run workflow** in the GitHub UI.

The workflow will:

1. Validate all 8 secrets are present
2. SSH into the Droplet
3. Write `.env` from secrets
4. `git reset --hard origin/master`
5. `docker compose pull && docker compose up -d --remove-orphans`
6. Wait 15 seconds, then health-check all 6 services
7. Print a container status table

Total deploy time: approximately 2–4 minutes.

---

## 11. Service Access URLs

After deploy, services are accessible at:

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

# Point your domain DNS A record to <YOUR_DROPLET_IP> first, then:
certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

For `thesolopreneur.ai`, point the DNS A record to your Droplet IP in your domain registrar's control panel, then run certbot to get a free SSL certificate.

---

## 13. Alternative Providers

This guide and the GitHub Actions workflow are provider-agnostic — the SSH deploy mechanism works identically on:

| Provider | Equivalent Tier | Monthly Cost | Notes |
|---|---|---|---|
| **DigitalOcean** | Premium AMD 4vCPU/8GB | ~$24 | **Recommended** — fastest signup, cleanest UI |
| **Vultr** | High Performance 4vCPU/8GB | ~$24 | Identical to DO, slightly more regions |
| **Linode (Akamai)** | Dedicated 4vCPU/8GB | ~$36 | More expensive but very stable |
| **Contabo** | VPS S SSD | ~$6 | Cheapest option, slower support |

Simply create a Droplet/instance on any of these, follow steps §2–§8, and the same GitHub Actions workflow will deploy to it without modification.

---

*Built by TheSolopreneur.AI — the founder's war room is always open.*
