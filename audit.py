"""Append-only audit log.

One JSON object per line in audit.log. Each entry stores the SHA-256 of the previous
line, so editing or removing an entry breaks the chain and verify() reports where.
Only whitelisted detail fields are ever recorded; secrets never reach the log.
"""
import hashlib, json, os, threading, time

GENESIS = "0" * 64
DETAIL_KEYS = ("action", "unit", "pid", "signal", "path", "src", "dst", "name", "id", "paths", "items", "to")


class AuditLog:
    def __init__(self, path):
        self.path = path
        self._lock = threading.Lock()
        self._last = self._tail_hash()

    def _tail_hash(self):
        last = None
        if os.path.exists(self.path):
            with open(self.path, "rb") as f:
                for line in f:
                    if line.strip():
                        last = line.rstrip(b"\n")
        return hashlib.sha256(last).hexdigest() if last else GENESIS

    def record(self, event, ip=None, outcome="ok", **detail):
        entry = {"ts": round(time.time(), 3), "event": event, "ip": ip, "outcome": outcome,
                 "detail": {k: v for k, v in detail.items() if k in DETAIL_KEYS and v is not None}, "prev": None}
        with self._lock:
            entry["prev"] = self._last
            line = json.dumps(entry, sort_keys=True, separators=(",", ":"))
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, "a") as f:
                f.write(line + "\n")
            self._last = hashlib.sha256(line.encode()).hexdigest()

    def tail(self, n=200):
        if not os.path.exists(self.path):
            return []
        with open(self.path) as f:
            lines = [l for l in f if l.strip()]
        out = []
        for l in lines[-n:]:
            try:
                out.append(json.loads(l))
            except ValueError:
                out.append({"event": "corrupt entry", "outcome": "error", "ts": 0, "detail": {}})
        return out[::-1]

    def verify(self):
        """Return (ok, entries_checked, first_bad_line_number_or_None)."""
        prev, n = GENESIS, 0
        if not os.path.exists(self.path):
            return True, 0, None
        with open(self.path, "rb") as f:
            for i, raw in enumerate(f, 1):
                raw = raw.rstrip(b"\n")
                if not raw.strip():
                    continue
                try:
                    if json.loads(raw).get("prev") != prev:
                        return False, n, i
                except ValueError:
                    return False, n, i
                prev, n = hashlib.sha256(raw).hexdigest(), n + 1
        return True, n, None
