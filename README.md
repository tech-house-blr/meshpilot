# Mesh Pilot

Open-source, self-hosted remote access platform. It discovers the devices on your private mesh VPN,
shows what they are, and lets you monitor and control them from one web console.

Status: early development. Nothing here is stable yet.

## Goals

- Discover devices on a Tailscale network automatically, with no per-device setup.
- Agentless first: use each device's native protocol (VNC, ADB, SSH).
- An optional Mesh Pilot agent for devices that have no usable native protocol.
- Few dependencies. The core depends on open protocols and a small, pinned set of libraries.
- Safe by default: credentials live in an encrypted vault, and every connection is audit-logged.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
