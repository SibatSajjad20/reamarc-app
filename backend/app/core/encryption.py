import base64
import hashlib
import logging
from cryptography.fernet import Fernet
from app.config import settings

logger = logging.getLogger(__name__)

def _get_fernet_key() -> bytes:
    """Derives a deterministic 32-byte URL-safe base64 Fernet key from settings.SECRET_KEY."""
    raw_key = settings.SECRET_KEY.encode("utf-8")
    digest = hashlib.sha256(raw_key).digest()
    return base64.urlsafe_b64encode(digest)

def encrypt_string(plain_text: str) -> str:
    """
    Encrypts a string using AES-256 (Fernet).
    Returns original string if empty or already encrypted (prefixed with 'gAAAAA').
    """
    if not plain_text or not plain_text.strip():
        return plain_text or ""
    if plain_text.startswith("gAAAAA"):
        return plain_text

    try:
        f = Fernet(_get_fernet_key())
        return f.encrypt(plain_text.encode("utf-8")).decode("utf-8")
    except Exception as err:
        logger.error(f"Error encrypting string: {err}")
        return plain_text

def decrypt_string(cipher_text: str) -> str:
    """
    Decrypts a Fernet-encrypted string.
    Returns original string if empty or not encrypted (doesn't start with 'gAAAAA').
    """
    if not cipher_text or not cipher_text.strip():
        return cipher_text or ""
    if not cipher_text.startswith("gAAAAA"):
        return cipher_text

    try:
        f = Fernet(_get_fernet_key())
        return f.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except Exception as err:
        logger.warning(f"Decryption failed or invalid Fernet token format: {err}")
        return cipher_text
