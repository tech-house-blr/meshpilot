import os
import socket
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from connectors.base import Machine  # noqa: E402
from connectors import capabilities as caps  # noqa: E402
import authz  # noqa: E402


def serve(reply=b"", read_first=False):
    """A one-shot TCP server on a free loopback port; returns its port."""
    ls = socket.socket()
    ls.bind(("127.0.0.1", 0))
    ls.listen(1)

    def run():
        try:
            c, _ = ls.accept()
            if read_first:
                c.settimeout(2)
                c.recv(64)
            if reply:
                c.sendall(reply)
            time.sleep(0.2)
            c.close()
        except OSError:
            pass
        ls.close()

    threading.Thread(target=run, daemon=True).start()
    return ls.getsockname()[1]


def closed_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class CheckTest(unittest.TestCase):
    def test_ssh_banner_is_available(self):
        c = caps.check("127.0.0.1", "ssh", serve(b"SSH-2.0-OpenSSH_9.6\r\n"))
        self.assertEqual((c.state, c.confidence, c.detail), ("available", "high", "SSH-2.0-OpenSSH_9.6"))

    def test_open_port_without_banner_is_only_detected(self):
        c = caps.check("127.0.0.1", "ssh", serve(b"hello\n"))
        self.assertEqual((c.state, c.error_code), ("detected", "unexpected_banner"))

    def test_silent_service_is_only_detected(self):
        c = caps.check("127.0.0.1", "vnc", serve(b""), timeout=0.4)
        self.assertEqual(c.state, "detected")

    def test_vnc_greeting(self):
        c = caps.check("127.0.0.1", "vnc", serve(b"RFB 003.008\n"))
        self.assertEqual((c.state, c.detail), ("available", "RFB 003.008"))

    def test_rdp_confirm(self):
        c = caps.check("127.0.0.1", "rdp", serve(bytes.fromhex("0300000b06d00000123400"), read_first=True))
        self.assertEqual(c.state, "available")

    def test_adb_reply(self):
        c = caps.check("127.0.0.1", "adb", serve(b"AUTH" + bytes(20), read_first=True))
        self.assertEqual(c.state, "available")

    def test_refused_is_unavailable_with_high_confidence(self):
        c = caps.check("127.0.0.1", "ssh", closed_port())
        self.assertEqual((c.state, c.error_code, c.confidence), ("unavailable", "refused", "high"))

    def test_expiry(self):
        c = caps.check("127.0.0.1", "ssh", closed_port(), now=1000)
        self.assertTrue(c.fresh(1000 + caps.TTL - 1))
        self.assertFalse(c.fresh(1000 + caps.TTL + 1))

    def test_scan_caches_all_protocols(self):
        m = Machine(id="m1", name="x", os="linux", addresses=["127.0.0.1"], owned=True, online=True)
        got = caps.scan(m)
        self.assertEqual({c.protocol for c in got}, {"ssh", "rdp", "vnc", "adb"})
        self.assertEqual(len(caps.cached("m1")), 4)
        caps.forget("m1")
        self.assertEqual(caps.cached("m1"), [])


def machine(**kw):
    d = dict(id="1", name="n", os="linux", addresses=["100.1.1.1"], owned=True, online=True)
    d.update(kw)
    return Machine(**d)


def cap(state="available", fresh=True, protocol="ssh"):
    now = time.time()
    return caps.Capability(protocol=protocol, state=state, checked_at=now, expires_at=now + (100 if fresh else -1))


ADMIN = authz.Actor("a", "admin")
VIEWER = authz.Actor("v", "viewer")


class AuthzTest(unittest.TestCase):
    def test_view_always_allowed(self):
        self.assertTrue(authz.decide(VIEWER, machine(owned=False), "view").allowed)

    def test_admin_can_scan_own_online_machine(self):
        self.assertTrue(authz.decide(ADMIN, machine(), "scan").allowed)

    def test_foreign_machine_denied_even_for_admin(self):
        d = authz.decide(ADMIN, machine(owned=False), "scan")
        self.assertEqual((d.allowed, d.code, d.status), (False, "foreign_machine", 403))

    def test_offline_denied(self):
        d = authz.decide(ADMIN, machine(online=False), "scan")
        self.assertEqual((d.code, d.status), ("offline", 409))

    def test_viewer_cannot_scan_or_use(self):
        for op in ("scan", "use"):
            d = authz.decide(VIEWER, machine(), op, cap())
            self.assertEqual((d.allowed, d.code), (False, "role_read_only"))

    def test_no_actor_denied(self):
        self.assertFalse(authz.decide(None, machine(), "scan").allowed)

    def test_unknown_machine_and_operation(self):
        self.assertEqual(authz.decide(ADMIN, None, "scan").status, 404)
        self.assertEqual(authz.decide(ADMIN, machine(), "delete").code, "unknown_operation")

    def test_use_needs_a_usable_fresh_capability(self):
        m = machine()
        self.assertTrue(authz.decide(ADMIN, m, "use", cap("available")).allowed)
        self.assertTrue(authz.decide(ADMIN, m, "use", cap("authenticated")).allowed)
        self.assertEqual(authz.decide(ADMIN, m, "use", None).code, "not_scanned")
        self.assertEqual(authz.decide(ADMIN, m, "use", cap("detected")).code, "capability_detected")
        self.assertEqual(authz.decide(ADMIN, m, "use", cap("unavailable")).code, "capability_unavailable")
        self.assertEqual(authz.decide(ADMIN, m, "use", cap("available", fresh=False)).code, "capability_stale")

    def test_ownership_checked_before_capability(self):
        d = authz.decide(ADMIN, machine(owned=False), "use", cap())
        self.assertEqual(d.code, "foreign_machine")


if __name__ == "__main__":
    unittest.main()
