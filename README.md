# Mesh Pilot

Open-source, self-hosted remote access platform. It discovers the devices on your private mesh VPN,
shows what they are, and lets you monitor and control them from one web console.

> **Status: early development (pre-1.0).** Interfaces, config and file formats can change between
> minor releases; the [changelog](CHANGELOG.md) calls out breaking changes. Do not expose it to the
> public internet.

## What works today

- **Machines:** automatic discovery of every device on your Tailscale network (through the local
  Tailscale API socket), with OS, status, owner and address. Devices owned by other accounts are
  view only.
- **Probe:** on-demand check for SSH, RDP, VNC and ADB on machines you own.
- **Host console:** system stats, processes, storage, network, services, logs, updates and a file
  manager, plus a browser desktop through noVNC.
- **Credential vault:** AES-256-GCM encrypted, with a versioned format and automatic migration.
- **Audit log:** hash-chained record of sign-ins, state-changing calls, downloads and vault access,
  with an Activity page that warns when the chain is broken.

See the [roadmap](docs/ROADMAP.md) for what comes next.

## Goals

- Discover devices on a Tailscale network automatically, with no per-device setup.
- Agentless first: use each device's native protocol (VNC, ADB, SSH).
- An optional Mesh Pilot agent for devices that have no usable native protocol.
- Few dependencies. The core depends on open protocols and a small, pinned set of libraries.
- Safe by default: credentials live in an encrypted vault, and every connection is audit-logged.

## Quick start

Requires Linux, Python 3.11 or newer, and Tailscale running on the host.

```sh
git clone https://github.com/tech-house-blr/meshpilot.git
cd meshpilot
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python set_password.py     # creates config.json and sets the admin password
./venv/bin/python app.py              # listens on port 8080
```

Then open `http://<host>:8080` and sign in.

## Security notes

Mesh Pilot can read and delete files, stop processes and services, and power off the machine it
runs on, behind a single admin password. Run it only inside your private network (for example
behind `tailscale serve`), use a strong password, and keep `config.json`, `vault.key` and
`audit.log` private; they are git-ignored. It listens on all interfaces by default, so firewall it
accordingly. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
