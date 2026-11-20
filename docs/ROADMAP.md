# Roadmap

Mesh Pilot follows [Semantic Versioning](https://semver.org). Before 1.0.0 the minor number marks a feature release and may include breaking changes, which the changelog calls out. From 1.0.0, breaking changes only land in major releases.

Each release ships as a git tag `vX.Y.Z` with a GitHub release and a [CHANGELOG](../CHANGELOG.md) entry. Features land through short-lived `feat/*` branches and pull requests into `main`. `VERSION` holds the current version.

| Release | Theme | Contents |
|---|---|---|
| 0.1.0 | Foundation | Pi Monitor baseline imported, connector interfaces, Tailscale discovery, Machines page, view-only rule for other people's devices |
| 0.2.0 | Identity | Mesh Pilot branding in the UI, manifest and docs |
| 0.3.0 | Trust | Encrypted credential vault with versioned format and automatic migration; audit log |
| 0.4.0 | Control plane | Provider-independent resource model, capability records with state, evidence and expiry (replacing the single `controllable` flag and the port probe), per-operation authorization on the server, revocable sessions and cookie hardening, operation records carried through the audit log |
| 0.5.0 | Screens | Agent with secure enrollment, per-device identity and revocation; Linux screen and input backend (RFB-compatible, so the existing noVNC client works unchanged); generic per-machine proxy that enforces authorization server-side; Connect button on each machine; audit entries; 'use my own VNC server' as an advanced fallback |
| 0.6.0 | Agent cross-platform | Windows and macOS screen backends, signed releases, self-update with rollback |
| 0.7.0 | Mobile | Android over ADB and a companion app, view-only iOS screen broadcast (Apple does not allow remote control of iPhones) |
| 0.8.0 | Plugins | Plugin API with process isolation and a manifest, RDP connector |
| 1.0.0 | Stable | Reviewed threat model (a first draft lives in `docs/THREAT_MODEL.md`), SECURITY.md, stable config, vault and plugin formats, upgrade guarantees |

Security and the resource model come before more reach: identity, authorization and trust boundaries are designed from the start, and later releases build on them. The order and contents of releases after the next one may change as the project learns what people need.

## Compatibility promises

- Config and vault files carry a format version and migrate themselves on startup.
- The connector interface carries `CONNECTOR_API`. It changes only in a major release after 1.0.0.
- Updating never requires manual steps. If one becomes unavoidable, the changelog says so at the top of the release.
