# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com) and the project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-11-19

### Added
- Connector layer with stable provider and connector interfaces (`connectors/`).
- Tailscale discovery through the local API socket. It needs no CLI and makes no network calls.
- Machines page listing every node with its OS, status, owner and address.
- On-demand protocol probe (SSH, RDP, VNC, ADB) for online machines you own.
- Devices owned by other accounts are listed as view only, and the server refuses to probe them.

### Changed
- The Pi Monitor console is now the base of this repository.
