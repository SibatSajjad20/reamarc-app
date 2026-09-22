"""Print a new VAPID key pair. Run locally; paste the values into the server env only."""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import b64urlencode


def generate_vapid_pair() -> tuple[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    private_raw = key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    private_key = base64.urlsafe_b64encode(private_raw).decode("ascii").rstrip("=")
    public_key = b64urlencode(public_raw)
    if isinstance(public_key, bytes):
        public_key = public_key.decode("ascii")
    return private_key, public_key


def main() -> None:
    private_key, public_key = generate_vapid_pair()
    print("Set these on the API host only. Do not commit the private key.")
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print("VAPID_SUBJECT=mailto:faizan@reamarc.com")


if __name__ == "__main__":
    main()
