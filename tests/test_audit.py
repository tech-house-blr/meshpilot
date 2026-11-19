import os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from audit import AuditLog  # noqa: E402


class AuditTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.p = os.path.join(self.d.name, "audit.log")

    def tearDown(self):
        self.d.cleanup()

    def fill(self, n=3):
        a = AuditLog(self.p)
        for i in range(n):
            a.record("service.action", ip="1.2.3.4", unit=f"u{i}.service", action="restart")
        return a

    def test_chain_verifies_and_survives_reopen(self):
        self.fill()
        a = AuditLog(self.p)
        a.record("login", ip="1.2.3.4")
        self.assertEqual(a.verify(), (True, 4, None))

    def test_edit_is_detected(self):
        self.fill()
        s = open(self.p).read().replace("u1.service", "u9.service")
        open(self.p, "w").write(s)
        ok, _, bad = AuditLog(self.p).verify()
        self.assertFalse(ok); self.assertEqual(bad, 3)

    def test_deleting_an_entry_is_detected(self):
        self.fill()
        lines = open(self.p).readlines()
        open(self.p, "w").writelines([lines[0], lines[2]])
        self.assertFalse(AuditLog(self.p).verify()[0])

    def test_only_whitelisted_fields_and_private_file(self):
        a = AuditLog(self.p)
        a.record("login", password="hunter2", path="/tmp/x")
        self.assertNotIn("hunter2", open(self.p).read())
        self.assertEqual(a.tail()[0]["detail"], {"path": "/tmp/x"})
        self.assertEqual(os.stat(self.p).st_mode & 0o777, 0o600)

    def test_tail_newest_first(self):
        a = self.fill(5)
        self.assertEqual(len(a.tail(2)), 2)
        self.assertEqual(a.tail()[0]["detail"]["unit"], "u4.service")


if __name__ == "__main__":
    unittest.main()
