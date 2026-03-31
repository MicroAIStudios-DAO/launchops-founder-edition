# LaunchOps Stack Deployment Checklist

**Objective:** Deploy a revenue-ready business in <2 hours.

## Phase 1: Infrastructure (15 mins)
- [ ] Run `chmod +x install.sh`
- [ ] Execute `./install.sh`
- [ ] Verify all 5 containers are running (`docker ps`)
- [ ] Save `.env` credentials to a secure location

## Phase 2: Core Configuration (45 mins)
- [ ] **Vaultwarden (http://localhost:8000)**
  - [ ] Login with `VAULT_ADMIN_TOKEN` from `.env`
  - [ ] Create master user account
- [ ] **WordPress (http://localhost:8080)**
  - [ ] Complete famous 5-minute install
  - [ ] Install WooCommerce / Course plugin
  - [ ] Apply brand theme
- [ ] **SuiteCRM (http://localhost:8081)**
  - [ ] Complete setup wizard
  - [ ] Define Sales Pipeline stages

## Phase 3: Marketing & Analytics (45 mins)
- [ ] **Mautic (http://localhost:8082)**
  - [ ] Complete setup wizard
  - [ ] Configure SMTP credentials
  - [ ] Create first opt-in form
- [ ] **Matomo (http://localhost:8083)**
  - [ ] Complete setup wizard
  - [ ] Generate tracking script
  - [ ] Add tracking script to WordPress header

## Phase 4: Monetization (15 mins)
- [ ] **Stripe Integration**
  - [ ] Get Live API Keys from Stripe Dashboard
  - [ ] Configure keys in WordPress/WooCommerce
  - [ ] Create first test product
  - [ ] Run test transaction

**SUCCESS CRITERIA:** 1 real business deployed end-to-end in <2h total setup time.
