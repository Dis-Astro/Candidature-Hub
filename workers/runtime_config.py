import base64
import os
from typing import Any, Dict

import psycopg2
import psycopg2.extras
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:v1:"


def decrypt_secret(value: str) -> str:
    if not value or not value.startswith(PREFIX):
        return value or ""
    raw_key = os.environ.get("CONFIG_ENCRYPTION_KEY", "")
    key = base64.b64decode(raw_key)
    if len(key) != 32:
        raise RuntimeError("CONFIG_ENCRYPTION_KEY must be 32 bytes encoded as base64")
    nonce_s, ciphertext_s, tag_s = value[len(PREFIX):].split(":")
    decode = lambda item: base64.urlsafe_b64decode(item + "=" * (-len(item) % 4))
    return AESGCM(key).decrypt(decode(nonce_s), decode(ciphertext_s) + decode(tag_s), None).decode("utf-8")


def load_config(database_url: str) -> Dict[str, Any]:
    defaults: Dict[str, Any] = {
        "storageRoot": "/data", "mailInboxPath": "/data/inbox/mail",
        "manualInboxPath": "/data/inbox/manual", "processedPath": "/data/processed",
        "attachmentsPath": "/data/attachments", "backupPath": "/data/backups",
        "errorPath": "/data/error",
        "mailEnabled": False, "pollSeconds": 60, "parserPollSeconds": 30,
        "ocrEnabled": False, "mailRetentionDays": 90,
        "backupRetentionDays": 30, "errorRetentionDays": 30,
    }
    with psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM system_config WHERE id = %s', ("main",))
            row = cur.fetchone()
    if row:
        defaults.update(dict(row))
    for field in ("imapPass", "smtpPass", "extDbPass"):
        defaults[field] = decrypt_secret(defaults.get(field, ""))
    return defaults


def ensure_storage(config: Dict[str, Any]) -> None:
    # /data is the only persistent storage exposed to the containers.  Keeping
    # the boundary fixed lets admins choose folders without granting the app
    # access to the host filesystem or Docker socket.
    root = os.path.realpath("/data")
    if os.path.realpath(config["storageRoot"]) != root:
        raise RuntimeError("Storage root must be /data")
    for field in ("mailInboxPath", "manualInboxPath", "processedPath", "attachmentsPath", "backupPath", "errorPath"):
        target = os.path.realpath(config[field])
        if target != root and not target.startswith(root + os.sep):
            raise RuntimeError(f"Unsafe path outside storage root: {target}")
        os.makedirs(target, exist_ok=True)
