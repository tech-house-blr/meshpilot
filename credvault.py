"""Encrypted credential vault.

Secrets are stored in vault.json, sealed with AES-256-GCM. The 32-byte key lives in
vault.key (mode 0600) and is created on first use. The file carries a format
version; older versions are migrated to CURRENT_VERSION when the vault opens.
"""
import base64, json, os, secrets, tempfile, threading
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

CURRENT_VERSION = 1
_AAD = b"meshpilot-vault"


class VaultError(Exception):
    pass


def _b64(b):
    return base64.b64encode(b).decode()


def _write_private(path, data):
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(data)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# MIGRATIONS[n] upgrades a decrypted payload from version n to n+1.
MIGRATIONS = {}


class Vault:
    def __init__(self, path, key_path):
        self.path, self.key_path = path, key_path
        self._lock = threading.Lock()
        self._key = self._load_key()

    def _load_key(self):
        if os.path.exists(self.key_path):
            key = base64.b64decode(open(self.key_path).read().strip())
            if len(key) != 32:
                raise VaultError("vault.key is not a 32-byte key")
            return key
        key = secrets.token_bytes(32)
        _write_private(self.key_path, _b64(key))
        return key

    def _seal(self, version, items):
        nonce = secrets.token_bytes(12)
        ct = AESGCM(self._key).encrypt(nonce, json.dumps(items).encode(), _AAD)
        return json.dumps({"version": version, "nonce": _b64(nonce), "data": _b64(ct)})

    def _open(self):
        if not os.path.exists(self.path):
            return CURRENT_VERSION, {}
        doc = json.load(open(self.path))
        version = doc.get("version")
        if not isinstance(version, int) or version < 1 or version > CURRENT_VERSION:
            raise VaultError(f"unsupported vault version: {version!r}")
        try:
            raw = AESGCM(self._key).decrypt(base64.b64decode(doc["nonce"]), base64.b64decode(doc["data"]), _AAD)
        except (InvalidTag, KeyError, ValueError):
            raise VaultError("vault cannot be decrypted (wrong key or corrupted file)")
        items = json.loads(raw)
        migrated = False
        while version < CURRENT_VERSION:
            items = MIGRATIONS[version](items)
            version += 1
            migrated = True
        if migrated:
            _write_private(self.path, self._seal(version, items))
        return version, items

    def _save(self, items):
        _write_private(self.path, self._seal(CURRENT_VERSION, items))

    def names(self):
        with self._lock:
            return sorted(self._open()[1])

    def get(self, name):
        with self._lock:
            return self._open()[1].get(name)

    def set(self, name, value):
        if not name or not isinstance(name, str):
            raise VaultError("name is required")
        with self._lock:
            _, items = self._open()
            items[name] = value
            self._save(items)

    def delete(self, name):
        with self._lock:
            _, items = self._open()
            existed = items.pop(name, None) is not None
            if existed:
                self._save(items)
            return existed
