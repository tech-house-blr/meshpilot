import json, os, stat, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import credvault  # noqa: E402
from credvault import Vault, VaultError  # noqa: E402


class VaultTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.p = os.path.join(self.d.name, "vault.json")
        self.k = os.path.join(self.d.name, "vault.key")

    def tearDown(self):
        self.d.cleanup()

    def test_roundtrip_and_no_plaintext(self):
        v = Vault(self.p, self.k)
        v.set("vnc:atlas", {"password": "hunter2-xyz"})
        self.assertEqual(Vault(self.p, self.k).get("vnc:atlas"), {"password": "hunter2-xyz"})
        self.assertNotIn("hunter2-xyz", open(self.p).read())
        self.assertEqual(v.names(), ["vnc:atlas"])

    def test_files_are_private(self):
        Vault(self.p, self.k).set("a", "b")
        for f in (self.p, self.k):
            self.assertEqual(stat.S_IMODE(os.stat(f).st_mode), 0o600)

    def test_wrong_key_and_tamper_fail(self):
        Vault(self.p, self.k).set("a", "b")
        os.unlink(self.k)
        with self.assertRaises(VaultError):
            Vault(self.p, self.k).names()

    def test_tamper_fails(self):
        v = Vault(self.p, self.k); v.set("a", "b")
        doc = json.load(open(self.p)); doc["data"] = doc["data"][:-8] + "AAAAAAAA"
        json.dump(doc, open(self.p, "w"))
        with self.assertRaises(VaultError):
            v.names()

    def test_access_is_audited_by_name_only(self):
        from audit import AuditLog
        a = AuditLog(os.path.join(self.d.name, "audit.log"))
        v = Vault(self.p, self.k, audit=a)
        v.set("vnc:atlas", "topsecret"); v.get("vnc:atlas"); v.delete("vnc:atlas")
        self.assertEqual([e["event"] for e in a.tail()], ["vault.delete", "vault.read", "vault.write"])
        self.assertNotIn("topsecret", open(a.path).read())

    def test_delete(self):
        v = Vault(self.p, self.k)
        v.set("a", 1)
        self.assertTrue(v.delete("a"))
        self.assertFalse(v.delete("a"))

    def test_future_version_refused(self):
        v = Vault(self.p, self.k); v.set("a", 1)
        doc = json.load(open(self.p)); doc["version"] = 99
        json.dump(doc, open(self.p, "w"))
        with self.assertRaises(VaultError):
            v.names()

    def test_migration_runs_and_rewrites(self):
        v = Vault(self.p, self.k)
        # forge a v1 file, then pretend v2 exists with a migration
        v.set("old", "x")
        credvault.CURRENT_VERSION = 2
        credvault.MIGRATIONS[1] = lambda items: {k: {"value": val} for k, val in items.items()}
        try:
            self.assertEqual(v.get("old"), {"value": "x"})
            self.assertEqual(json.load(open(self.p))["version"], 2)
            self.assertEqual(v.get("old"), {"value": "x"})  # stable after rewrite
        finally:
            credvault.CURRENT_VERSION = 1
            credvault.MIGRATIONS.clear()


if __name__ == "__main__":
    unittest.main()
