# Threat model (first version)

Status: draft for review. It describes Mesh Pilot at 0.3.0 plus the agent core in development. It will change as the resource model, authorization and agent enrollment are built. Nothing here claims the product is hardened.

## What is being protected

- **Control of managed machines.** Mesh Pilot can read and delete files, kill processes, change services, reboot, and soon show and drive a desktop.
- **Credentials** in the vault (`vault.json`, `vault.key`) and the admin password hash and session key in `config.json`.
- **The audit log** (`audit.log`), which is the record of who did what.
- **The inventory**: what machines exist and what can be done to them.

## Trust boundaries

1. Browser to Mesh Pilot server. Carries the admin session.
2. Mesh Pilot server to the host it runs on. The server runs as a normal user with a few `sudo -n` rights, so a server compromise reaches that user and those rights.
3. Server to other machines (Tailscale discovery today, agents and protocols later).
4. Server to the agent, then agent to the desktop it controls.
5. The Tailscale network. Network membership is a connectivity fact. It is not permission to use Mesh Pilot.

## Assumptions

- Mesh Pilot is deployed on a private network, in front of the admin only.
- There is one admin account today.
- The host running the server is trusted. If it is fully compromised, the vault key, session key and audit log are compromised with it. The vault and the hash chain do not defend against that case, and documentation must not imply they do.

## Threats

For each: how it could happen, what exists today, what is planned, and the risk that remains.

### T1. Compromised or stolen admin session
- **Attack:** Cookie theft from a browser, malware or a shared machine, or guessing the password.
- **Today:** Cookie is HttpOnly and `SameSite=Strict`. Lifetime is 12 hours. Logout only clears the browser's copy, so a stolen cookie stays valid until it expires. `Secure` is not set. Login throttle is in memory and keyed by `remote_addr`.
- **Planned:** Server-side sessions that can be revoked, `Secure` cookie, a throttle that survives restarts and uses the real client address, then MFA and OIDC.
- **Residual risk:** High until revocation exists. One admin account means one stolen session is full control.
- **Detection:** Login and logout are audited. There is no alert on unusual logins.

### T2. Compromised Mesh Pilot server
- **Attack:** A bug in the server, a dependency, or the host.
- **Today:** Everything an attacker needs is local: password hash, session key, vault key next to the vault, audit log. The agent shared token (when enrolled) would be stored encrypted, but the key is local too.
- **Planned:** Per-device agent identity that the device can refuse and revoke, short-lived grants, device-side policy limits so a stolen server key does not mean unlimited access, remote audit forwarding.
- **Residual risk:** High. A compromised server is a compromised fleet today.
- **Detection:** Weak. The audit log can be rewritten from the same host.

### T3. Compromised managed device
- **Attack:** Malware on a machine that runs the agent.
- **Today:** The agent only serves a screen to a caller with the token. It does not reach the server.
- **Planned:** Agent connections are initiated from the server side with a per-device credential, so one device cannot learn credentials for others. Device credentials are never reused across machines.
- **Residual risk:** Medium. A compromised device can show a false screen to the admin.
- **Detection:** None yet.

### T4. Malicious peer on the network
- **Attack:** Another tailnet member, or someone on the local network, connects to the server or an agent directly.
- **Today:** The server listens on loopback by default (0.3.0 change) and is reached through `tailscale serve`. The agent requires a token before sending anything. Other people's machines are shown view only.
- **Planned:** Agents listen only on the Tailscale address. Mutual authentication between server and agent.
- **Residual risk:** Medium. The shared agent token is a bearer credential, and anyone on the path who obtains it can connect.
- **Detection:** The agent logs every rejected connection to its own log only.

### T5. Stolen credentials from the vault
- **Attack:** Someone copies `vault.json` and `vault.key`.
- **Today:** AES-256-GCM, versioned format, key file mode 0600. The key is on the same disk.
- **Planned:** Key rotation, scoping by machine and purpose, optional external secret manager, audit of every secret read.
- **Residual risk:** High if the host is compromised, by design. Disk backups that contain both files defeat the encryption.
- **Detection:** Vault reads and writes are audited from inside the process.

### T6. Malicious or compromised plugin
- **Attack:** Third-party code runs inside the server and reads the vault or the database.
- **Today:** No plugin system exists, so there is no exposure.
- **Planned:** Plugins run as separate processes with a declared manifest, scoped permissions and resource limits. No plugin runs inside the main process. This must be designed before the 0.7.0 plugin API ships.
- **Residual risk:** Not yet applicable.
- **Detection:** To be designed.

### T7. Supply chain: agent and plugin releases
- **Attack:** A tampered agent binary or update.
- **Today:** The agent is built from source. There are no release binaries or self-update.
- **Planned:** Signed releases, verified update metadata, rollback protection.
- **Residual risk:** Not yet applicable, but self-update must not ship before signing.
- **Detection:** Hash and signature verification failures logged.

### T8. Audit log deletion or forgery
- **Attack:** Someone with file access edits or truncates `audit.log` and recomputes the chain.
- **Today:** Hash chain with verification. Detects accidental edits and partial tampering. It does not stop a full rewrite.
- **Planned:** Remote forwarding and signed checkpoints.
- **Residual risk:** High against a host-level attacker.
- **Detection:** Chain verification on the Activity page.

### T9. Abuse of destructive and bulk actions
- **Attack:** An authenticated user, or a script with a stolen session, deletes files, kills processes or reboots machines.
- **Today:** Each action is one request. Power, delete and kill have no confirmation step in the API.
- **Planned:** Operation records, approval for destructive actions, per-operation permissions, rate limits on bulk work.
- **Residual risk:** High. All admin actions are one request away.
- **Detection:** Actions are audited after the fact.

### T10. Malicious or careless administrator
- **Attack:** An insider uses legitimate access.
- **Today:** One shared admin account makes actions unattributable to a person.
- **Planned:** Individual users, roles, resource scopes, separation of duties for high-impact actions.
- **Residual risk:** High until multiple users exist.
- **Detection:** Audit log, once actions carry a real identity.

## Mitigations ranked by value

1. Revocable sessions and cookie hardening (T1).
2. Per-resource authorization with capability states instead of `controllable` (T4, T9, T10).
3. Per-device agent credentials, revocation, and device-side policy (T2, T3, T4).
4. Operation records and approvals for destructive actions (T9).
5. Remote audit forwarding (T2, T8).
6. Plugin isolation design before any plugin API ships (T6).
7. Signed releases before any self-update (T7).

## Known limits to state publicly

- A fully compromised server host defeats the vault and the audit chain.
- Mesh Pilot should not be exposed to the public internet.
- The audit log is tamper-evident, not tamper-proof.
