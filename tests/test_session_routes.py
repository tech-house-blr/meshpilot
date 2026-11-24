import json, os, sys, tempfile, unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
_state = tempfile.TemporaryDirectory()
os.environ["MESHPILOT_STATE_DIR"] = _state.name
from werkzeug.security import generate_password_hash  # noqa: E402
json.dump({"secret_key": "test-secret", "password_hash": generate_password_hash("correct horse"),
           "session_idle_seconds": 3600}, open(os.path.join(_state.name, "config.json"), "w"))
import app as meshapp  # noqa: E402

H = {"X-Requested-With": "MeshPilot"}
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0"}


def login(c, headers=UA, **kw):
    return c.post("/login", data={"password": "correct horse"}, headers=headers, **kw)


class RouteTest(unittest.TestCase):
    def setUp(self):
        meshapp.sessions.revoke_all()
        meshapp._fails.clear()
        self.c = meshapp.app.test_client()

    def test_api_needs_a_login(self):
        self.assertEqual(self.c.get("/api/sessions").status_code, 401)

    def test_login_then_list(self):
        self.assertEqual(login(self.c).status_code, 302)
        r = self.c.get("/api/sessions").get_json()
        self.assertEqual(len(r["sessions"]), 1)
        self.assertTrue(r["sessions"][0]["current"])
        self.assertEqual(r["sessions"][0]["label"], "Firefox on Linux")

    def test_logout_kills_a_copied_cookie(self):
        login(self.c)
        cookie = self.c.get_cookie("session").value
        self.c.get("/logout")
        other = meshapp.app.test_client()
        other.set_cookie("session", cookie)
        self.assertEqual(other.get("/api/sessions").status_code, 401)

    def test_revoke_other_session_signs_it_out(self):
        a, b = meshapp.app.test_client(), meshapp.app.test_client()
        login(a), login(b)
        refs = a.get("/api/sessions").get_json()["sessions"]
        theirs = [s for s in refs if not s["current"]][0]["ref"]
        self.assertEqual(a.post("/api/sessions/revoke", json={"id": theirs}, headers=H).get_json()["revoked"], 1)
        self.assertEqual(b.get("/api/sessions").status_code, 401)
        self.assertEqual(a.get("/api/sessions").status_code, 200)

    def test_revoke_others_keeps_mine(self):
        a, b, d = (meshapp.app.test_client() for _ in range(3))
        login(a), login(b), login(d)
        self.assertEqual(a.post("/api/sessions/revoke-others", headers=H).get_json()["revoked"], 2)
        self.assertEqual(b.get("/api/sessions").status_code, 401)
        self.assertEqual(a.get("/api/sessions").status_code, 200)

    def test_revoke_needs_the_csrf_header(self):
        login(self.c)
        self.assertEqual(self.c.post("/api/sessions/revoke-others").status_code, 400)

    def test_new_login_replaces_the_old_session(self):
        login(self.c)
        first = self.c.get_cookie("session").value
        login(self.c)
        self.assertEqual(len(meshapp.sessions.listing()), 1)
        stale = meshapp.app.test_client()
        stale.set_cookie("session", first)
        self.assertEqual(stale.get("/api/sessions").status_code, 401)

    def test_cookie_flags(self):
        r = login(self.c, headers={**UA, "X-Forwarded-Proto": "https"}, environ_overrides={"REMOTE_ADDR": "127.0.0.1"})
        flags = r.headers["Set-Cookie"]
        self.assertIn("HttpOnly", flags)
        self.assertIn("SameSite=Strict", flags)
        self.assertIn("Secure", flags)
        plain = login(meshapp.app.test_client(), environ_overrides={"REMOTE_ADDR": "192.168.1.5"}).headers["Set-Cookie"]
        self.assertNotIn("Secure", plain)

    def test_forwarded_proto_from_a_remote_host_is_ignored(self):
        r = login(self.c, headers={**UA, "X-Forwarded-Proto": "https"}, environ_overrides={"REMOTE_ADDR": "203.0.113.9"})
        self.assertNotIn("Secure", r.headers["Set-Cookie"])

    def test_cookie_holds_no_login_flag(self):
        login(self.c)
        from itsdangerous import URLSafeTimedSerializer
        from flask.sessions import session_json_serializer
        raw = self.c.get_cookie("session").value
        data = URLSafeTimedSerializer("test-secret", salt="cookie-session", serializer=session_json_serializer,
                                      signer_kwargs={"key_derivation": "hmac", "digest_method": __import__("hashlib").sha1}).loads(raw)
        self.assertEqual(set(data) - {"_permanent"}, {"sid"})  # an opaque token, no login flag

    def test_rejected_cookie_is_audited(self):
        login(self.c)
        meshapp.sessions.revoke_all()
        self.c.get("/api/sessions")
        events = [e["event"] for e in meshapp.audit.tail(20)]
        self.assertIn("session.rejected", events)


if __name__ == "__main__":
    unittest.main()
