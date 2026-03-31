# LaunchOps Founder Edition: Hetzner VPS Setup Guide

This guide covers the exact steps to deploy the LaunchOps Founder Edition stack on a fresh Hetzner VPS. This is the official playbook for the live YouTube launch demo.

The goal is to go from zero to a live, production-ready, 5-service business infrastructure (WordPress, SuiteCRM, Mautic, Matomo, Vaultwarden) in under 2 hours.

---

## 1. Provision the Server

We recommend the **Hetzner CX41** (or CPX41 for more CPU). It provides the necessary RAM (16GB) to comfortably run the 5-service Docker stack plus the LaunchOps orchestrator.

1. Go to the [Hetzner Cloud Console](https://console.hetzner.cloud/).
2. Click **New Project** -> **Add Server**.
3. **Location:** Ashburn, VA (or whichever is closest to your target market).
4. **Image:** Ubuntu 24.04 (or 22.04).
5. **Type:** Shared vCPU -> **CX41** (8 vCPU, 16 GB RAM, ~€16.40/mo).
6. **SSH Key:** Add your public SSH key. (Do not use password auth).
7. **Name:** `launchops-prod-01`.
8. Click **Create & Buy Now**.

*Note your server's public IPv4 address once it spins up.*

---

## 2. Initial Server Setup

Open your terminal and SSH into the new server:

```bash
ssh root@<YOUR_SERVER_IP>
```

Update the system and install prerequisites:

```bash
apt update && apt upgrade -y
apt install -y curl git ufw python3-pip python3-venv
```

Configure the firewall to allow SSH, HTTP, and HTTPS:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Install Docker and Docker Compose:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable --now docker
```

---

## 3. Clone the Execution Engine

Clone the canonical repository. Since this is the founder edition, we run it directly from `/root` or a dedicated user home directory.

```bash
git clone https://github.com/MicroAIStudios-DAO/launchops-founder-edition.git
cd launchops-founder-edition
```

---

## 4. Deploy the Infrastructure Stack

The `install.sh` script automates the generation of secure credentials, writes them to the `.env` file, and brings up the Docker Compose stack.

```bash
# Make the scripts executable
chmod +x install.sh healthcheck.sh

# Run the installer
./install.sh
```

The script will output the generated passwords for all services. **Save these.** They are also stored securely in the generated `.env` file.

---

## 5. Verify Service Health

Once the Docker stack finishes pulling and starting (this can take 2-5 minutes depending on the image sizes), run the health check:

```bash
./healthcheck.sh
```

You should see `[OK]` for:
- WordPress (Port 8080)
- SuiteCRM (Port 8081)
- Mautic (Port 8082)
- Matomo (Port 8083)
- Vaultwarden (Port 8084)

---

## 6. DNS Configuration

Before setting up SSL, you must point your domains to the Hetzner server's IP address.

Go to your DNS provider (e.g., Cloudflare, Namecheap, Route53) and create the following **A Records** pointing to `<YOUR_SERVER_IP>`:

| Subdomain | Domain | Purpose |
| :--- | :--- | :--- |
| `@` | `dynexissystems.com` | Main Site (WordPress) |
| `www` | `dynexissystems.com` | Main Site (WordPress) |
| `crm` | `dynexissystems.com` | SuiteCRM |
| `mail` | `dynexissystems.com` | Mautic |
| `analytics` | `dynexissystems.com` | Matomo |
| `vault` | `dynexissystems.com` | Vaultwarden |

*(Ensure proxying/CDN is turned **OFF** (DNS-only) during the initial SSL certificate generation).*

---

## 7. SSL Setup (Let's Encrypt)

We use Nginx as a reverse proxy to route traffic to the correct Docker containers and handle SSL.

Install Nginx and Certbot:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Copy the provided Nginx configuration:

```bash
cp nginx/conf.d/launchops-stack.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/launchops-stack.conf /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
```

Edit the configuration to match your actual domains:

```bash
nano /etc/nginx/sites-available/launchops-stack.conf
# Replace 'yourdomain.com' with 'dynexissystems.com' throughout the file
```

Test and restart Nginx:

```bash
nginx -t
systemctl restart nginx
```

Generate SSL certificates for all subdomains:

```bash
certbot --nginx -d dynexissystems.com -d www.dynexissystems.com -d crm.dynexissystems.com -d mail.dynexissystems.com -d analytics.dynexissystems.com -d vault.dynexissystems.com
```

---

## 8. Start the Command Center (Operator UI)

With the infrastructure running, start the LaunchOps Command Center. This requires running both the FastAPI backend and the React/Vite frontend.

**Start the Backend:**

```bash
# In a new tmux or screen session
cd ~/launchops-founder-edition/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

**Start the Frontend:**

```bash
# In another tmux or screen session
cd ~/launchops-founder-edition/frontend
# Install Node.js/npm if not present, then:
npm install -g pnpm
pnpm install
pnpm dev --host 0.0.0.0 --port 3000
```

*Note: For the live demo, you can access the Command Center UI directly via `http://<YOUR_SERVER_IP>:3000` (ensure port 3000 is open in UFW), or set up another Nginx block to serve it securely.*

---

## 9. Execute the 20-Stage Pipeline

You are now ready to launch the business. Open the Command Center UI in your browser, navigate to the **Launch Run** tab, and click **Execute Pipeline**.

Alternatively, run it via the CLI:

```bash
cd ~/launchops-founder-edition
python3 launchops.py launch
```

The Atlas orchestrator will begin executing the pipeline, starting with `intake`, moving through `formation`, `infrastructure` verification, `legal` document generation, and into `growth`.

**The infrastructure is live. The engine is wired. You are ready to launch.**
