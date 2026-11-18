"""Mesh Pilot connector layer: providers discover machines, connectors talk to them."""
import time

from .base import CONNECTOR_API, Machine, Provider, Connector, PROBE_PORTS, tcp_open
from .tailscale import TailscaleProvider

PROVIDERS = [TailscaleProvider()]
_cache = {"t": 0, "machines": [], "errors": {}}
TTL = 5


def machines(force=False):
    if force or time.time() - _cache["t"] > TTL:
        found, errs = [], {}
        for p in PROVIDERS:
            found += p.discover()
            if p.error:
                errs[p.id] = p.error
        _cache.update(t=time.time(), machines=found, errors=errs)
    return _cache["machines"], _cache["errors"]


def find(machine_id):
    return next((m for m in machines()[0] if str(m.id) == str(machine_id)), None)


def probe(machine):
    """On-demand TCP probe. Only for machines the signed-in user owns and that are online."""
    if not (machine.owned and machine.online and machine.addresses):
        return None
    host = next((a for a in machine.addresses if "." in a), machine.addresses[0])
    return {name: tcp_open(host, port) for name, port in PROBE_PORTS.items()}
