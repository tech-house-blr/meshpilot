"""Capability records: what a machine can actually do, how sure we are, and for how long.

A capability is one protocol on one machine. Its state climbs as evidence improves:

  unknown        never checked
  detected       the port accepts a connection (weak: something is listening)
  available      the service answered with the protocol's own greeting (it speaks the protocol)
  authenticated  we logged in with a stored credential (set by adapters, not by this probe)
  unavailable    the port refused or did not answer
  error          the check itself failed in an unexpected way

"Authorized" is deliberately not a stored state: it depends on who is asking, so authz.decide()
answers it per actor at request time.
"""
import socket
import struct
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, asdict

from .base import PROBE_PORTS

STATES = ("unknown", "detected", "available", "authenticated", "unavailable", "error")
USABLE = ("available", "authenticated")
TTL = 300          # seconds a result stays fresh
MAX_CACHED = 512   # machines kept in memory


@dataclass
class Capability:
    protocol: str
    state: str = "unknown"
    evidence: str = ""
    confidence: str = "low"        # low | medium | high
    checked_at: float = 0.0
    expires_at: float = 0.0
    error_code: str = ""
    detail: str = ""               # for example the SSH banner or RFB version
    provider: str = "tcp-probe"

    def fresh(self, now=None):
        return (now or time.time()) < self.expires_at

    def public(self):
        d = asdict(self)
        d["fresh"] = self.fresh()
        return d


# ---------- per protocol greetings ----------
def _read(sock, n=255):
    try:
        return sock.recv(n)
    except (socket.timeout, OSError):
        return b""


def _ssh(sock):
    b = _read(sock)
    if b.startswith(b"SSH-"):
        return "available", "high", "SSH banner received", b.split(b"\n")[0].decode("ascii", "replace").strip()[:80], ""
    return "detected", "low", "port open but no SSH banner", "", "unexpected_banner"


def _vnc(sock):
    b = _read(sock, 12)
    if b.startswith(b"RFB 003."):
        return "available", "high", "RFB greeting received", b.decode("ascii", "replace").strip(), ""
    return "detected", "low", "port open but no RFB greeting", "", "unexpected_banner"


# TPKT(19 bytes) + X.224 CR + RDP negotiation request (standard protocol only, no credentials)
RDP_REQUEST = bytes.fromhex("030000130ee000000000000100080003000000")


def _rdp(sock):
    # X.224 Connection Request, as sent by every RDP client; a server answers with a TPKT header.
    sock.sendall(RDP_REQUEST)
    b = _read(sock, 16)
    if len(b) >= 4 and b[0] == 3 and b[1] == 0:
        return "available", "medium", "X.224 connection confirm received", "", ""
    return "detected", "low", "port open but no RDP answer", "", "unexpected_banner"


def _adb(sock):
    data = b"host::\x00"
    cmd = b"CNXN"
    hdr = struct.pack("<4sIII II", cmd, 0x01000000, 256 * 1024, len(data), sum(data) & 0xFFFFFFFF,
                      struct.unpack("<I", cmd)[0] ^ 0xFFFFFFFF)
    sock.sendall(hdr + data)
    b = _read(sock, 24)
    if b[:4] in (b"CNXN", b"AUTH"):
        return "available", "medium", "ADB %s reply received" % b[:4].decode(), "", ""
    return "detected", "low", "port open but no ADB answer", "", "unexpected_banner"


GREETINGS = {"ssh": _ssh, "vnc": _vnc, "rdp": _rdp, "adb": _adb}


def check(host, protocol, port=None, timeout=1.5, now=None):
    """Check one protocol on one host. Never raises."""
    now = now or time.time()
    cap = Capability(protocol=protocol, checked_at=now, expires_at=now + TTL)
    port = port or PROBE_PORTS[protocol]
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            s.settimeout(timeout)
            fn = GREETINGS.get(protocol)
            if fn is None:
                cap.state, cap.confidence, cap.evidence = "detected", "low", "tcp %d accepted a connection" % port
            else:
                cap.state, cap.confidence, cap.evidence, cap.detail, cap.error_code = fn(s)
    except ConnectionRefusedError:
        cap.state, cap.confidence, cap.evidence, cap.error_code = "unavailable", "high", "tcp %d refused the connection" % port, "refused"
    except socket.timeout:
        cap.state, cap.confidence, cap.evidence, cap.error_code = "unavailable", "low", "tcp %d did not answer in time" % port, "timeout"
    except OSError as e:
        cap.state, cap.confidence, cap.evidence, cap.error_code = "error", "low", "network error: %s" % (e.strerror or type(e).__name__), "network_error"
    return cap


# ---------- cache ----------
_lock = threading.Lock()
_cache = {}


def scan(machine):
    """Check every known protocol on a machine in parallel and remember the result."""
    host = next((a for a in machine.addresses if "." in a), machine.addresses[0] if machine.addresses else None)
    if not host:
        return []
    with ThreadPoolExecutor(max_workers=len(PROBE_PORTS)) as ex:
        caps = list(ex.map(lambda p: check(host, p), PROBE_PORTS))
    with _lock:
        _cache[str(machine.id)] = {c.protocol: c for c in caps}
        while len(_cache) > MAX_CACHED:
            _cache.pop(next(iter(_cache)))
    return caps


def cached(machine_id):
    with _lock:
        return list((_cache.get(str(machine_id)) or {}).values())


def forget(machine_id):
    with _lock:
        _cache.pop(str(machine_id), None)
