# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com) and the project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

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
