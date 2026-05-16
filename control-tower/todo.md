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
- [ ] Add Control Tower service to docker-compose.yml with Docker socket mount
- [ ] Add Dockerfile for Control Tower build
- [ ] Add .dockerignore for clean builds
- [ ] Wire notifyOwner alert in pollAll when service status flips to down or warning
- [ ] Persist previous status in DB to detect state transitions (not just current state)
- [ ] Add alert cooldown to avoid repeated notifications for the same down service
- [ ] Commit docker-compose + alert changes to GitHub
