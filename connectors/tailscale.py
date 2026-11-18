"""Tailscale discovery through tailscaled's local API socket. No CLI, no account, no network calls."""
import http.client
import json
import os
import socket

from .base import Provider, Machine

SOCKETS = ("/var/run/tailscale/tailscaled.sock", "/run/tailscale/tailscaled.sock")


class _Unix(http.client.HTTPConnection):
    def __init__(self, path, timeout=4):
        super().__init__("local-tailscaled.sock", timeout=timeout)
        self._path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self._path)


def _status():
    path = next((p for p in SOCKETS if os.path.exists(p)), None)
    if not path:
        raise RuntimeError("tailscaled socket not found")
    c = _Unix(path)
    try:
        c.request("GET", "/localapi/v0/status", headers={"Host": "local-tailscaled.sock"})
        r = c.getresponse()
        body = r.read()
        if r.status != 200:
            raise RuntimeError("tailscaled returned %s" % r.status)
        return json.loads(body)
    finally:
        c.close()


def parse(status):
    """Pure function over the status document, so it is testable without a daemon."""
    users = {str(k): v.get("LoginName", "") for k, v in (status.get("User") or {}).items()}
    me = str((status.get("Self") or {}).get("UserID", ""))
    out = []
    nodes = [(status["Self"], True)] if status.get("Self") else []
    nodes += [(p, False) for p in (status.get("Peer") or {}).values()]
    for n, is_self in nodes:
        uid = str(n.get("UserID", ""))
        dns = (n.get("DNSName") or "").rstrip(".")
        ls = n.get("LastSeen") or ""
        out.append(Machine(
            id=n.get("ID") or n.get("NodeID") or dns,
            name=dns.split(".")[0] or n.get("HostName", ""),
            os=(n.get("OS") or "unknown").lower(),
            addresses=n.get("TailscaleIPs") or [],
            dns=dns,
            owner=users.get(uid, ""),
            owned=bool(uid) and uid == me,
            online=bool(n.get("Online")) or is_self,
            is_self=is_self,
            last_seen="" if ls.startswith("0001") else ls,
            provider="tailscale",
            tags=list(n.get("Tags") or []),
        ))
    out.sort(key=lambda m: (not m.is_self, not m.online, not m.owned, m.name))
    return out


class TailscaleProvider(Provider):
    id = "tailscale"
    label = "Tailscale"

    def discover(self):
        try:
            st = _status()
            self.error = None if st.get("BackendState") == "Running" else "Tailscale is %s" % st.get("BackendState")
            return parse(st)
        except (OSError, RuntimeError, ValueError) as e:
            self.error = str(e)
            return []
