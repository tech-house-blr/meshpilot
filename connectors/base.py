"""Connector interfaces. Stable surface for providers and connectors; bump CONNECTOR_API on breaking changes."""
import socket
from dataclasses import dataclass, field, asdict

CONNECTOR_API = 1


@dataclass
class Machine:
    id: str
    name: str
    os: str
    addresses: list
    dns: str = ""
    owner: str = ""
    owned: bool = False      # belongs to the signed-in tailnet user; only owned machines may be controlled
    online: bool = False
    is_self: bool = False
    last_seen: str = ""
    provider: str = ""
    tags: list = field(default_factory=list)

    def public(self):
        d = asdict(self)
        d["controllable"] = self.owned and self.online
        return d


class Provider:
    """Finds machines. Implementations must not raise: return [] and set .error instead."""
    id = "base"
    label = "Base"
    error = None

    def discover(self):
        raise NotImplementedError


class Connector:
    """A way to talk to a machine over one protocol."""
    id = "base"
    label = "Base"
    ports = ()               # TCP ports that hint this protocol is available

    def applies(self, machine):
        return True


# Protocols the on-demand probe looks for. Extend by adding connectors, not by editing the probe.
PROBE_PORTS = {"ssh": 22, "rdp": 3389, "vnc": 5900, "adb": 5555}


def tcp_open(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False
