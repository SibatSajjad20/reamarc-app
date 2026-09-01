"""Hardcoded office geofence & IP security constants (Rawalpindi HQ)."""

from __future__ import annotations

from typing import List

from app.config import settings

# Rawalpindi HQ Coordinates & Map Link
OFFICE_LATITUDE: float = 33.52062764084008
OFFICE_LONGITUDE: float = 73.09183393441234
OFFICE_MAP_URL: str = "https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA"
OFFICE_WIFI_IP: str = "154.57.199.55"
GEOFENCE_RADIUS_METERS: float = 500.0
MAX_GPS_ACCURACY_METERS: float = 500.0


def get_built_in_office_ips() -> List[str]:
    """Hardcoded office WAN IP merged with env and local dev loopback."""
    ips = [OFFICE_WIFI_IP]
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
