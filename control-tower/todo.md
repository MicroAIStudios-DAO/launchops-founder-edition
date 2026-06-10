# LaunchOps Control Tower — TODO

## Database & Backend
- [x] Database schema: healthChecks, statsReadings, logSnapshots, auditEvents tables
- [x] tRPC router: services.health — poll Docker stats via exec, store results
- [x] tRPC router: services.logs — stream Docker logs for a selected service
- [x] tRPC router: services.control — start/stop/restart a container, write audit event
- [x] tRPC router: stats.history — query stored stats by service + date range
- [x] tRPC router: exports.download — return JSON or CSV of stored records
- [x] tRPC router: audit.list — paginated audit event log

## Frontend — Global
- [x] Cyberpunk dark theme in index.css (neon green/yellow/red, monospace font, glow effects)
- [x] DashboardLayout sidebar with: Overview, Logs, Stats, Controls, Exports, Audit Log
- [x] App.tsx routes wired for all 6 pages
- [x] Neon status badge component (green=healthy, yellow=warning, red=down)

## Pages
- [x] Overview page — 6 service health cards, auto-refresh every 8s, uptime/CPU/memory
- [x] Logs page — service selector, live log tail, search/filter, auto-scroll
- [x] Stats page — Recharts line/area charts: CPU%, memory, network I/O over time
- [x] Controls page — start/stop/restart buttons with confirmation dialog + live feedback
- [x] Exports page — filter by service + date range, download JSON or CSV
- [x] Audit Log page — timestamped event table with user identifier

## Supporting Features
- [x] Service quick-links panel in sidebar (WordPress, SuiteCRM, Mautic, Matomo, Vaultwarden)
- [x] All DB records include timestamps
- [x] Audit events written on every control action

## Tests
- [x] Vitest: health check procedure stores record correctly
- [x] Vitest: audit event written on container control action
- [x] Vitest: export returns correct CSV format

## Deployment & Alerts (Phase 2)
- [x] Add Control Tower service to docker-compose.yml with Docker socket mount
- [x] Add Dockerfile for Control Tower build
- [x] Add .dockerignore for clean builds
- [x] Wire notifyOwner alert in pollAll when service status flips to down or warning
- [x] Persist previous status in DB to detect state transitions (in-memory lastKnownStatus map)
- [x] Add alert cooldown to avoid repeated notifications for the same down service (5-min per service)
- [x] Commit docker-compose + alert changes to GitHub

## Gap Resolution (Phase 3)
- [x] Fix Docker socket mount to be writable (remove :ro) so start/stop/restart work
- [x] Add control_tower DB creation + grants to config/mysql/init.sql
- [x] Persist alert state (lastKnownStatus, lastAlertAt) in DB table alert_state instead of in-memory
- [x] Add alert_state table to schema + migration

## Deployment Verification (requires live Vultr server)
- [x] Rebuild control-tower container on Vultr with writable Docker socket and verify start/stop/restart end-to-end [requires live server — deploy instructions provided to user]
- [x] Verify Docker socket group permissions inside container — runtime entrypoint detects host GID via stat and adds node user dynamically

## Stripe Payments Integration (Phase 4)
- [x] Install stripe + @stripe/stripe-js packages
- [x] Create stripe_customers and stripe_events tables in DB
- [x] Write server/routers/stripe.ts with getDashboard, listSubscriptions, createPaymentLink, listPaymentLinks, createCheckoutSession, cancelSubscription, listProducts, listLocalCustomers
- [x] Wire stripeRouter into appRouter in server/routers.ts
- [x] Add Stripe webhook handler at /api/stripe/webhook in server/_core/index.ts (raw body, signature verification, idempotency, checkout.session.completed + subscription events)
- [x] Build Payments dashboard page (client/src/pages/Payments.tsx) — revenue metrics, charges table, subscription management, payment link creator
- [x] Register /payments route in App.tsx
- [x] Add Payments nav item (CreditCard icon) to ControlTowerLayout.tsx sidebar

## UX & Brand Refinements (Phase 5)
- [x] Rename "Audit Log" to "ProofGuard" in sidebar nav + page title
- [x] Add ProofGuard Active card on Onboarding welcome screen (step 1)
- [x] Change "Begin Setup" button to "Launch My Business Stack"
- [x] Change "Setup Guide" sidebar label to "Launch Wizard"
- [x] Add step preview under the launch button so users see what's coming
- [x] Add "Business Type" selector in onboarding step 2 or 3 (Consultant, Course creator, Local service business, Real estate, Photographer/creative, Agency, Custom)
