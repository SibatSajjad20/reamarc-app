"""Office geofence constants. WAN IPs come from env only — never hardcode them."""

from __future__ import annotations

from typing import List

from app.config import settings

# Rawalpindi HQ pin (public map location; not a secret).
OFFICE_LATITUDE: float = 33.52062764084008
OFFICE_LONGITUDE: float = 73.09183393441234
OFFICE_MAP_URL: str = "https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA"
GEOFENCE_RADIUS_METERS: float = 500.0
MAX_GPS_ACCURACY_METERS: float = 500.0


def get_built_in_office_ips() -> List[str]:
    """Office WAN IPs from OFFICE_PUBLIC_IPS. Loopback is added only outside production."""
    ips: List[str] = []
    raw = (settings.OFFICE_PUBLIC_IPS or "").strip()
    if raw:
        for part in raw.split(","):
            part_str = part.strip()
            if part_str and part_str not in ips:
                ips.append(part_str)
    env_name = (settings.ENVIRONMENT or "").strip().lower()
    if env_name not in ("production", "prod"):
        for dev_ip in ("127.0.0.1", "::1"):
            if dev_ip not in ips:
                ips.append(dev_ip)
    return ips
