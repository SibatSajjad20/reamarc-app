import base64
import hashlib
import logging
from typing import List, Optional

from cryptography.fernet import Fernet

from app.config import settings

logger = logging.getLogger(__name__)

_PLACEHOLDER_ENCRYPTION_KEY = "32_byte_fernet_key_base64_encoded"
_SECRET_FIELDS = ("access_token", "refresh_token", "developer_token", "client_secret")


def _derive_key(material: str) -> bytes:
    digest = hashlib.sha256(material.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet_key_from_env(raw: str) -> Optional[bytes]:
    """Accept a Fernet key (url-safe 32-byte b64) or derive one from a passphrase."""
    text = (raw or "").strip()
    if not text or text == _PLACEHOLDER_ENCRYPTION_KEY:
        return None
    try:
        padded = text + "=" * (-len(text) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        if len(decoded) == 32:
            return base64.urlsafe_b64encode(decoded)
    except Exception:
        pass
    return _derive_key(text)


def _primary_key() -> bytes:
    env_key = _fernet_key_from_env(getattr(settings, "ENCRYPTION_KEY", "") or "")
    if env_key is not None:
        return env_key
    return _derive_key(settings.SECRET_KEY)


def _decrypt_keys() -> List[bytes]:
    keys: List[bytes] = []
    primary = _primary_key()
    keys.append(primary)
    legacy = _derive_key(settings.SECRET_KEY)
    if legacy != primary:
        keys.append(legacy)
    return keys


def encrypt_string(plain_text: str) -> str:
    """
    Encrypt a string with Fernet.
    Empty values pass through. Existing Fernet tokens (gAAAAA…) are left unchanged.
    Raises ValueError on failure so callers never persist plaintext.
    """
    if not plain_text or not plain_text.strip():
        return plain_text or ""
    if plain_text.startswith("gAAAAA"):
        return plain_text

    try:
        f = Fernet(_primary_key())
        return f.encrypt(plain_text.encode("utf-8")).decode("utf-8")
    except Exception as err:
        logger.error("Error encrypting string: %s", err)
        raise ValueError("Failed to encrypt credential; refusing to store plaintext.") from err


def decrypt_string(cipher_text: str) -> str:
    """
    Decrypt a Fernet token. Tries ENCRYPTION_KEY first, then the legacy SECRET_KEY-derived key.
    Unencrypted strings (no gAAAAA prefix) are returned as-is.
    """
    if not cipher_text or not cipher_text.strip():
        return cipher_text or ""
    if not cipher_text.startswith("gAAAAA"):
        return cipher_text

    last_err: Optional[Exception] = None
    for key in _decrypt_keys():
        try:
            return Fernet(key).decrypt(cipher_text.encode("utf-8")).decode("utf-8")
        except Exception as err:
            last_err = err
            continue
    logger.warning("Decryption failed for Fernet token: %s", last_err)
    return cipher_text


def encrypt_credential_fields(doc: dict) -> dict:
    """Return a copy of cred_doc with secret fields encrypted."""
    out = dict(doc)
    for field in _SECRET_FIELDS:
        value = out.get(field)
        if value:
            out[field] = encrypt_string(str(value))
    return out
