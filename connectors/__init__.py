"""Mesh Pilot connector layer: providers discover machines, connectors talk to them."""
import time

from .base import CONNECTOR_API, Machine, Provider, Connector, PROBE_PORTS, tcp_open
from .tailscale import TailscaleProvider
from . import capabilities

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
    """Scan what a machine supports and remember it. Authorization is checked by the caller (see authz.py)."""
    return capabilities.scan(machine)
