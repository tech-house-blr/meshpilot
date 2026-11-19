# Security policy

Mesh Pilot is pre-1.0. Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:
open the **Security** tab of this repository and choose **Report a vulnerability**.

Include what you found, the version, steps to reproduce, and the impact you see. You will get an
acknowledgement within a few days, and we will keep you updated until a fix is released. We credit
reporters in the release notes unless you prefer not to be named.

## Scope

In scope: authentication and session handling, the credential vault, the audit log, the file,
process, service and power APIs, and the Tailscale connector.

Out of scope: issues that need an already signed-in admin acting as intended, and vulnerabilities
in bundled third-party code such as noVNC (report those upstream).

## Deploying safely

Run Mesh Pilot only on a private network, use a strong admin password, and keep `config.json`,
`vault.key` and `audit.log` private. A full threat model arrives with 1.0.0.
