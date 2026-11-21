#!/usr/bin/env python3
"""Set the admin password: ./venv/bin/python set_password.py  (creates config.json if missing)"""
import getpass, json, os, secrets, sys
from werkzeug.security import generate_password_hash

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
conf = json.load(open(path)) if os.path.exists(path) else {"secret_key": secrets.token_hex(32)}
pw = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("New admin password: ")
if len(pw) < 8:
    sys.exit("Password must be at least 8 characters.")
conf["password_hash"] = generate_password_hash(pw)
json.dump(conf, open(path, "w"))
os.chmod(path, 0o600)
# a new password ends every login that used the old one
db = os.path.join(os.path.dirname(path), "sessions.db")
if os.path.exists(db):
    sys.path.insert(0, os.path.dirname(path))
    from sessions import SessionStore
    n = SessionStore(db).revoke_all()
    print(f"Signed out {n} session{'s' if n != 1 else ''}.")
print("Password set. Restart the service: sudo systemctl restart meshpilot")
