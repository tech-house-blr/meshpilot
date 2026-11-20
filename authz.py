"""Authorization decisions, kept apart from discovery and from the HTTP layer.

decide() is a pure function: given who is asking, the machine, the operation and (for "use")
the capability, it returns an allow or deny with a stable code and a plain reason. The routes
call it and never re-implement the rules. Rules run in this order and the first denial wins.

Operations:
  view  read the inventory                     (any role)
  scan  check what a machine can do            (admin; owned, online machine)
  use   open a connection through a capability (admin; owned, online machine, usable and fresh capability)
"""
import time
from dataclasses import dataclass

from connectors.capabilities import USABLE

READ_ONLY_OPS = ("view",)


@dataclass(frozen=True)
class Actor:
    id: str
    role: str = "admin"   # admin | viewer


@dataclass(frozen=True)
class Decision:
    allowed: bool
    code: str = "ok"
    reason: str = ""
    status: int = 200      # HTTP status to use when denied

    def public(self):
        return {"allowed": self.allowed, "code": self.code, "reason": self.reason}


def _deny(code, reason, status):
    return Decision(False, code, reason, status)


def decide(actor, machine, operation, capability=None, now=None):
    if operation == "view":
        return Decision(True)
    if operation not in ("scan", "use"):
        return _deny("unknown_operation", "Unknown operation.", 400)
    if actor is None or actor.role not in ("admin",):
        return _deny("role_read_only", "This account can only view.", 403)
    if machine is None:
        return _deny("unknown_machine", "Unknown machine.", 404)
    if not machine.owned:
        return _deny("foreign_machine", "This machine belongs to another account, so it is view only.", 403)
    if not machine.online:
        return _deny("offline", "This machine is offline.", 409)
    if operation == "use":
        if capability is None or capability.state == "unknown":
            return _deny("not_scanned", "Scan this machine first to see what it supports.", 409)
        if not capability.fresh(now or time.time()):
            return _deny("capability_stale", "The last scan is out of date. Scan again.", 409)
        if capability.state not in USABLE:
            return _deny("capability_" + capability.state, "%s is %s on this machine." % (capability.protocol.upper(), capability.state), 409)
    return Decision(True)
