import os, sqlite3, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sessions import SessionStore, IDLE_SECONDS, MAX_SECONDS  # noqa: E402

UA = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"


class SessionTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.d.name, "sessions.db")
        self.s = SessionStore(self.path)

    def tearDown(self):
        self.d.cleanup()

    def test_token_is_valid_and_never_stored(self):
        t = self.s.create("1.2.3.4", UA, now=1000)
        self.assertIsNotNone(self.s.validate(t, now=1001))
        raw = sqlite3.connect(self.path).execute("SELECT id FROM sessions").fetchall()
        self.assertNotIn(t, [r[0] for r in raw])
        self.assertEqual(len(raw[0][0]), 64)

    def test_unknown_or_empty_token_is_refused(self):
        for bad in (None, "", "nope", 5):
            self.assertIsNone(self.s.validate(bad))

    def test_idle_timeout(self):
        t = self.s.create(now=1000)
        self.assertIsNone(self.s.validate(t, now=1000 + IDLE_SECONDS + 1))
        self.assertIsNone(self.s.validate(t, now=1000 + 5))  # row is gone for good

    def test_activity_extends_idle_but_not_the_cap(self):
        t = self.s.create(now=0)
        step = IDLE_SECONDS - 60
        now = 0
        while now + step < MAX_SECONDS:
            now += step
            self.assertIsNotNone(self.s.validate(t, now=now))
        self.assertIsNone(self.s.validate(t, now=MAX_SECONDS + 1))

    def test_revoke_makes_a_copied_cookie_useless(self):
        t = self.s.create(now=1000)
        self.assertEqual(self.s.revoke(t), 1)
        self.assertIsNone(self.s.validate(t, now=1001))

    def test_revoke_others_keeps_the_current_one(self):
        a, b, c = (self.s.create(now=1000) for _ in range(3))
        self.assertEqual(self.s.revoke_others(a), 2)
        self.assertIsNotNone(self.s.validate(a, now=1001))
        self.assertIsNone(self.s.validate(b, now=1001))
        self.assertIsNone(self.s.validate(c, now=1001))

    def test_revoke_all(self):
        ts = [self.s.create(now=1000) for _ in range(3)]
        self.assertEqual(self.s.revoke_all(), 3)
        self.assertTrue(all(self.s.validate(t, now=1001) is None for t in ts))

    def test_listing_marks_current_and_hides_tokens(self):
        a = self.s.create("1.1.1.1", UA, now=1000)
        self.s.create("2.2.2.2", "curl/8.0", now=1001)
        rows = self.s.listing(a, now=1002)
        self.assertEqual([r["current"] for r in rows], [False, True])
        self.assertEqual(rows[1]["label"], "Firefox on Linux")
        self.assertEqual(rows[0]["label"], "curl")
        self.assertNotIn(a, str(rows))

    def test_revoke_by_ref(self):
        a = self.s.create(now=1000)
        ref = self.s.listing(a, now=1001)[0]["ref"]
        self.assertEqual(self.s.revoke_ref("zz"), 0)
        self.assertEqual(self.s.revoke_ref(ref[:5]), 0)  # too short to be safe
        self.assertEqual(self.s.revoke_ref(ref), 1)
        self.assertIsNone(self.s.validate(a, now=1002))

    def test_expired_rows_are_purged_on_create(self):
        self.s.create(now=0)
        self.s.create(now=MAX_SECONDS + 10)
        self.assertEqual(len(self.s.listing(now=MAX_SECONDS + 11)), 1)

    def test_file_is_private(self):
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
