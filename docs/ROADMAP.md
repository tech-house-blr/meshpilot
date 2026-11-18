# Roadmap

Mesh Pilot follows [Semantic Versioning](https://semver.org). Before 1.0.0 the minor number marks a feature release and may include breaking changes, which the changelog calls out. From 1.0.0, breaking changes only land in major releases.

Each release ships as a git tag `vX.Y.Z` with a GitHub release and a [CHANGELOG](../CHANGELOG.md) entry. Features land through short-lived `feat/*` branches and pull requests into `main`. `VERSION` holds the current version.

| Release | Theme | Contents |
|---|---|---|
| 0.1.0 | Foundation | Pi Monitor baseline imported, connector interfaces, Tailscale discovery, Machines page, view-only rule for other people's devices |
| 0.2.0 | Identity | Mesh Pilot branding in the UI, manifest and docs |
| 0.3.0 | Trust | Encrypted credential vault with versioned format and automatic migration; audit log |
| 0.4.0 | Screens | VNC connector with the existing noVNC client, per-machine control |
| 0.5.0 | Agent preview | Go agent (Linux), single static binary, signed releases, self-update with rollback |
| 0.6.0 | Agent cross-platform | Windows and macOS agent builds |
| 0.7.0 | Plugins | Android over ADB, RDP connector, versioned plugin API |
| 1.0.0 | Stable | Threat model, SECURITY.md, stable config, vault and plugin formats, upgrade guarantees |

The order and contents of releases after the next one may change as the project learns what people need.

## Compatibility promises

- Config and vault files carry a format version and migrate themselves on startup.
- The connector interface carries `CONNECTOR_API`. It changes only in a major release after 1.0.0.
- Updating never requires manual steps. If one becomes unavoidable, the changelog says so at the top of the release.
