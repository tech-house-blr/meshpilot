"""Server-side sessions.

The browser cookie carries only a random token. The server stores the SHA-256 of that token with its
creation time, last activity, expiry and a short label, so a session can be listed, ended or refused at
any moment. A copied cookie stops working the moment its row is deleted, expires or goes idle.
"""
import hashlib, os, secrets, sqlite3, threading, time

IDLE_SECONDS = 2 * 60 * 60       # no activity for this long ends the session
MAX_SECONDS = 12 * 60 * 60       # hard cap from login, whatever the activity
TOUCH_EVERY = 30                 # last_seen is written at most this often per session


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _label(ua):
    ua = ua or ""
    for needle, name in (("Edg/", "Edge"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari"), ("curl/", "curl")):
        if needle in ua:
            browser = name
            break
    else:
        browser = "Unknown browser"
    for needle, name in (("Windows", "Windows"), ("Android", "Android"), ("iPhone", "iOS"), ("iPad", "iOS"),
                         ("Macintosh", "macOS"), ("Linux", "Linux")):
        if needle in ua:
            return f"{browser} on {name}"
    return browser


class SessionStore:
    def __init__(self, path, idle=IDLE_SECONDS, maximum=MAX_SECONDS):
        self.path, self.idle, self.maximum = path, idle, maximum
        self._lock = threading.Lock()
        fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
        os.close(fd)
        with self._db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created REAL NOT NULL, "
                       "last_seen REAL NOT NULL, ip TEXT, label TEXT)")

    def _db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def create(self, ip=None, user_agent=None, now=None):
        """Start a session and return the token for the cookie. The token itself is never stored."""
        now = time.time() if now is None else now
        token = secrets.token_urlsafe(32)
        with self._lock, self._db() as db:
            self._purge(db, now)
            db.execute("INSERT INTO sessions VALUES (?,?,?,?,?)", (_hash(token), now, now, ip, _label(user_agent)))
        return token

    def _purge(self, db, now):
        db.execute("DELETE FROM sessions WHERE created < ? OR last_seen < ?", (now - self.maximum, now - self.idle))

    def validate(self, token, now=None):
        """Return the session row for a live token, or None. Activity extends only the idle window."""
        if not token or not isinstance(token, str):
            return None
        now = time.time() if now is None else now
        sid = _hash(token)
        with self._lock, self._db() as db:
            row = db.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
            if not row:
                return None
            if now - row["created"] > self.maximum or now - row["last_seen"] > self.idle:
                db.execute("DELETE FROM sessions WHERE id=?", (sid,))
                return None
            if now - row["last_seen"] > TOUCH_EVERY:
                db.execute("UPDATE sessions SET last_seen=? WHERE id=?", (now, sid))
            return dict(row)

    def listing(self, current_token=None, now=None):
        now = time.time() if now is None else now
        cur = _hash(current_token) if current_token else None
        with self._lock, self._db() as db:
            self._purge(db, now)
            rows = db.execute("SELECT * FROM sessions ORDER BY created DESC").fetchall()
        return [dict(ref=r["id"][:12], created=r["created"], last_seen=r["last_seen"], ip=r["ip"], label=r["label"],
                     current=r["id"] == cur, expires=min(r["created"] + self.maximum, r["last_seen"] + self.idle))
                for r in rows]

    def revoke(self, token):
        with self._lock, self._db() as db:
            return db.execute("DELETE FROM sessions WHERE id=?", (_hash(token),)).rowcount

    def revoke_ref(self, ref):
        """End one session by the short reference shown in the list. Returns how many were ended."""
        if not ref or len(ref) < 12 or not all(c in "0123456789abcdef" for c in ref):
            return 0
        with self._lock, self._db() as db:
            return db.execute("DELETE FROM sessions WHERE substr(id,1,?)=?", (len(ref), ref)).rowcount

    def revoke_others(self, keep_token):
        with self._lock, self._db() as db:
            return db.execute("DELETE FROM sessions WHERE id<>?", (_hash(keep_token),)).rowcount

    def revoke_all(self):
        with self._lock, self._db() as db:
            return db.execute("DELETE FROM sessions").rowcount
