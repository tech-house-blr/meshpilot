# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com) and the project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

### Changed
- Logins are now sessions kept on the server (`sessions.db`, next to `metrics.db`). The cookie holds only a random token, and the server stores only its hash. A session ends at logout, after 2 hours without activity, or 12 hours after sign-in, whichever comes first. Set `session_idle_seconds` and `session_max_seconds` in `config.json` to change this. Everyone is signed out once when you update. Setting a password with `set_password.py` also signs everyone out.
- The session cookie gets the `Secure` flag when the browser reached Mesh Pilot over HTTPS, directly or through a proxy on the same machine such as `tailscale serve`. Plain HTTP still works.
- Runtime state can live elsewhere: set `MESHPILOT_STATE_DIR` to move `config.json`, `audit.log`, `sessions.db` and `metrics.db`. The default is the code folder, as before.
- `/api/machines` now includes each machine's `capabilities`. `/api/machines/probe` returns `capabilities` and a `code` on denial; the old `ports` map is still returned for now. `Machine.controllable` stays for compatibility but is no longer the rule the server enforces.
- `python app.py` now listens on `127.0.0.1` by default. Set `MESHPILOT_HOST` and `MESHPILOT_PORT` to change it. Breaking for anyone who relied on the old `0.0.0.0` default.

### Added
- Signed-in sessions on the Activity page: see each device, when it signed in and was last active, and sign one or all others out. `/api/sessions`, `/api/sessions/revoke` and `/api/sessions/revoke-others` do the same. A refused cookie is recorded in the audit log as `session.rejected`.
- Capability records. A scan now says what each machine really supports and how sure it is: `detected` (a port is open), `available` (the service answered with its own greeting, checked for SSH, VNC, RDP and ADB), `unavailable` or `error`, each with evidence, a confidence level and an expiry (five minutes). Results are kept between page refreshes and the Machines page shows them, with the evidence in a tooltip.
- `authz.py`: one place that decides who may view, scan or use a machine, with a stable reason code for every denial. The probe route uses it. Ownership, online state, role and capability freshness are checked in that order.
- `agent/`: the core of the Mesh Pilot agent, a Go program that serves a machine's screen over RFB so the existing noVNC client works unchanged. It checks a token on every connection, handles pixel formats, resizing, pointer, keyboard and clipboard, and has pluggable screen and input backends. No real screen backend yet: `--demo` serves a synthetic screen.
- README rewritten for public release, plus SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue templates and a pull request template.

## [0.3.0] - 2026-11-19

### Added
- Encrypted credential vault (`credvault.py`): AES-256-GCM, key in `vault.key` (0600), versioned file format with automatic migration on open.
- Audit log (`audit.py`, `audit.log`): sign-ins, sign-outs, every state-changing API call, file downloads and vault access. Entries are hash-chained, so edits or deletions are detected. Only whitelisted fields are stored, never secrets.
- Activity page that shows the log, newest first, and warns when the chain is broken.

## [0.2.0] - 2026-11-19

### Changed
- The UI, login page, web app manifest and password script now say Mesh Pilot instead of Pi Monitor.
- The request header that guards state-changing calls is now `X-Requested-With: MeshPilot`.
- The service-control page also refuses to stop or disable a `meshpilot` unit.

## [0.1.0] - 2026-11-19

### Added
- Connector layer with stable provider and connector interfaces (`connectors/`).
- Tailscale discovery through the local API socket. It needs no CLI and makes no network calls.
- Machines page listing every node with its OS, status, owner and address.
- On-demand protocol probe (SSH, RDP, VNC, ADB) for online machines you own.
- Devices owned by other accounts are listed as view only, and the server refuses to probe them.

### Changed
- The Pi Monitor console is now the base of this repository.
