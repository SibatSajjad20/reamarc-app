"""Office geofence defaults — override via environment (see Settings)."""

from __future__ import annotations

from typing import List

from app.config import settings

OFFICE_LATITUDE: float = float(settings.OFFICE_LATITUDE)
OFFICE_LONGITUDE: float = float(settings.OFFICE_LONGITUDE)
OFFICE_MAP_URL: str = (settings.OFFICE_MAP_URL or "").strip()
GEOFENCE_RADIUS_METERS: float = float(settings.GEOFENCE_RADIUS_METERS)
MAX_GPS_ACCURACY_METERS: float = float(settings.MAX_GPS_ACCURACY_METERS)


def get_built_in_office_ips() -> List[str]:
    """Env-configured office WAN IPs merged with local dev loopback when not in production."""
    raw = (settings.OFFICE_PUBLIC_IPS or "").strip()
    ips = [part.strip() for part in raw.split(",") if part.strip()]
    env_name = (settings.ENVIRONMENT or "").strip().lower()
    if env_name not in ("production", "prod"):
        for dev_ip in ("127.0.0.1", "::1"):
            if dev_ip not in ips:
                ips.append(dev_ip)
    return ips
