# Gap analysis

This compares Mesh Pilot as it is today with the target described in the product review brief (a provider-independent, secure management plane for private infrastructure). It records what the code does now, checked against the source, not what the roadmap hopes for.

Status values: `implemented`, `partial`, `missing`, `unsafe`, `unclear`, `not applicable yet`. Evidence points at files in the repository at version 0.3.0 plus the unreleased changes on `main`.

## Summary

Mesh Pilot started as a single-machine console (Pi Monitor) and still behaves like one: most routes act on the host that runs the server. The multi-machine layer is the Tailscale connector and the Machines page, and it is thin. The largest structural gaps are the missing resource and capability model, the lack of any authorization beyond "signed in", and sessions that cannot be revoked.

## Matrix

| # | Requirement | Status | Evidence | Gap and risk |
|---|---|---|---|---|
| 1 | Discovery separate from authorization | unsafe | `connectors/base.py`: `controllable = owned and online`; `app.py` `machines_probe` gates on `m.owned` | One boolean mixes who discovered the machine, who owns it and whether it may be controlled. Ownership comes straight from Tailscale and is the only check. |
| 2 | Capability model (state, evidence, expiry) | missing | `connectors/__init__.py` `probe()` returns `{name: bool}` | A TCP connect is the only signal. No distinction between detected, available, authenticated and authorized. Results are not stored or expired. |
| 3 | Canonical resource model | partial | `Machine` dataclass | Fields exist, but the model is shaped like a Tailscale node: no resource kind, no relationships, no source-specific IDs, no provenance. |
| 4 | More than one discovery provider, with reconciliation | partial | `PROVIDERS` list, `Provider` base class | The interface exists and has one implementation. Nothing reconciles duplicates, and `id` is the Tailscale node ID. |
| 5 | Provider failures do not corrupt inventory | partial | `Provider.discover` contract, `errors` returned with the list | Failures are reported and not raised. The inventory is only a five second in-memory cache, so there is nothing to corrupt, but there is also no "not seen" or "removed" state. |
| 6 | Server-side authorization for every sensitive operation | partial | `api` decorator in `app.py` | Every route requires a signed-in session, which is real server-side checking. There is no per-operation or per-resource permission, and no read-only role. |
| 7 | Multiple users, OIDC, MFA | missing | one `password_hash` in `config.json` | Single shared admin password. |
| 8 | Session management and revocation | unsafe | Flask signed cookie, `PERMANENT_SESSION_LIFETIME` 12 hours, `logout` only clears the cookie | A stolen cookie stays valid until it expires and cannot be revoked. `SESSION_COOKIE_SECURE` is not set, and the app is served over both HTTP and HTTPS. |
| 9 | Login throttling | partial | `_fails` dict in `app.py` | In memory, so it resets on restart. Keyed on `request.remote_addr`, which is the same address for everyone behind the Tailscale proxy, so one attacker could lock everyone out. |
| 10 | CSRF protection | implemented | `api` decorator requires `X-Requested-With: MeshPilot` on POST, cookie is `SameSite=Strict` | Adequate for the current API. State-changing GET routes would break it, and none exist. |
| 11 | Credential vault: encryption and format | implemented | `credvault.py`, `tests/test_vault.py` | AES-256-GCM, versioned format, migrations, private key file. Tested. |
| 12 | Vault: key management, scoping, rotation | partial | `credvault.py` | No key rotation, no per-resource or per-purpose scoping, no backup guidance. The key sits next to the vault, so a compromised host exposes both. This must be stated in `SECURITY.md`. |
| 13 | Vault is used by the application | missing | no route or connector calls `Vault` | The vault exists but nothing stores or uses credentials yet. |
| 14 | Secrets never in logs or ordinary APIs | implemented | `audit.py` records only whitelisted fields | Good design. Needs a regression test once credentials flow through the app. |
| 15 | Audit log content | partial | `audit_requests` in `app.py`, `audit.py` | Records actor IP, action, outcome. Missing: effective identity, target resource, authorization decision, correlation or operation ID. Only POST routes and one GET are audited. |
| 16 | Audit integrity | partial | `audit.py` hash chain and `verify()`, `tests/test_audit.py` | Detects edits, but someone with file access can rewrite and re-chain it. Described as tamper-evident in the docs, which is accurate. No remote forwarding or signed checkpoints. |
| 17 | Operations and jobs with cancellation | missing | `power()` spawns `sh -c "sleep 2; sudo ..."`; apt work runs in a thread | No operation ID, no status, no cancellation, no timeout, no result record. |
| 18 | Approval for destructive actions | missing | `power`, `fs/delete`, `processes/kill` | Single click, no confirmation step in the API. |
| 19 | Protocol logic out of API routes | unsafe | `app.py` holds file, process, service, apt, power and VNC proxy code (about 890 lines) | Everything lives in one module. Hard to test and to apply authorization uniformly. |
| 20 | Remote operations on other machines | missing | all `/api/*` routes except `machines` act on the local host | The console manages only the machine it runs on. The multi-machine goal is not implemented. |
| 21 | Agent identity, enrollment, revocation, signed updates | partial | `agent/` (PR #11) | The agent checks a shared token (stored as a SHA-256). No per-device identity, no revocation, no mutual authentication, no signed updates. It is a prototype. |
| 22 | Agent does not duplicate SSH | not applicable yet | `agent/` serves a screen only | Screen sharing is something SSH does not provide. Scope is fine for now. |
| 23 | Plugin isolation | not applicable yet | none | No plugin system exists. The roadmap's plugin API must follow the isolation rules in the brief. |
| 24 | Threat model | partial | `docs/THREAT_MODEL.md` (separate PR) | Was missing. First version written, not yet reviewed. |
| 25 | API versioning and contracts | missing | unversioned `/api/*` routes | No version prefix, no documented schema. |
| 26 | Health, backup and recovery | partial | `/api/...` health data, `metrics.db` | Host metrics exist. No backup or restore guidance for `config.json`, `vault.*`, `audit.log` and `metrics.db`. |
| 27 | Automated tests | partial | `tests/` (audit, vault, Tailscale parsing) | Good for the three modules covered. No tests for routes, authorization allow and deny, throttling, or the agent beyond its own package. |

## Highest-risk items

1. Items 1, 2 and 6: control decisions rest on a Tailscale ownership flag and a port probe. Fixing this is the foundation for everything else.
2. Item 8: sessions that cannot be revoked, and no `Secure` flag on the cookie.
3. Item 9: the throttle can be turned into a lockout of every user when running behind the proxy.
4. Item 21: agent trust model is a shared token. Fine for a demo, not for something that can inject input into a desktop.

## Proposed order

1. Resource and capability model, with authorization checks per operation (replaces `controllable` and the port probe).
2. Session hardening: server-side session store with revocation, `Secure` cookie, throttle keyed correctly.
3. Operation records with IDs, carried through the audit log.
4. Agent enrollment with per-device identity and revocation, then the Linux screen backend.
5. Break `app.py` into modules as each area is touched, not in one large rewrite.
