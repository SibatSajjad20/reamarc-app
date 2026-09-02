"""
Security and Geofencing Validators for Attendance Check-In / Check-Out.
Enforces office IP / subnet whitelisting and GPS Haversine geofencing.

Office proof is OR, not AND: a whitelisted office IP or an in-range GPS fix
is enough to punch in. Desktop Chrome/Edge often cannot obtain GPS at all
(Windows Location Services), so requiring both would lock out staff who are
physically on office Wi-Fi.

A coarse / city-level browser guess is treated as GPS unknown (office Wi-Fi
may still allow check-in). Only a tight fix whose accuracy circle cannot
cover HQ is treated as out of range (covers home + office VPN).
"""
from __future__ import annotations

import ipaddress
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List, Literal, Optional, Sequence, Tuple

from app.constants.office_location import get_built_in_office_ips, MAX_GPS_ACCURACY_METERS
from app.schemas.attendance import SecuritySettingsSchema

GpsFixClass = Literal["in_range", "out_of_range", "coarse"]


EARTH_RADIUS_METERS: float = 6371000.0
PRIVATE_OR_LOOPBACK = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)


def _parse_ip(value: Optional[str]) -> Optional[ipaddress._BaseAddress]:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.lower() == "localhost":
        return ipaddress.ip_address("127.0.0.1")
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    if "%" in raw:
        raw = raw.split("%", 1)[0]
    try:
        return ipaddress.ip_address(raw)
    except ValueError:
        return None


def is_loopback_ip(value: Optional[str]) -> bool:
    ip_obj = _parse_ip(value)
    if ip_obj is None:
        return False
    return bool(ip_obj.is_loopback)


def is_public_ip(value: Optional[str]) -> bool:
    ip_obj = _parse_ip(value)
    if ip_obj is None:
        return False
    return not (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_reserved
        or ip_obj.is_multicast
        or ip_obj.is_unspecified
    )


def is_private_or_loopback_ip(value: Optional[str]) -> bool:
    ip_obj = _parse_ip(value)
    if ip_obj is None:
        return True
    return any(ip_obj in net for net in PRIVATE_OR_LOOPBACK) or ip_obj.is_loopback or ip_obj.is_private


def collect_whitelist_entries(settings: SecuritySettingsSchema) -> List[str]:
    """Merge every configured IP / CIDR field into a single allow-list."""
    entries: List[str] = []
    seen = set()
    extra_whitelist = getattr(settings, "office_ip_whitelist", None) or []
    for item in (
        list(get_built_in_office_ips())
        + list(settings.office_public_ips or [])
        + list(settings.office_subnets or [])
        + list(extra_whitelist)
    ):
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        entries.append(text)
    return entries


def validate_client_ip(
    client_ip: Optional[str],
    allowed_ips: Sequence[str],
    allowed_subnets: Sequence[str] = (),
) -> bool:
    """
    Validates whether client_ip matches an allowed IP or falls within an allowed CIDR.
    Loopback is NOT auto-approved; it must be explicitly listed.
    CIDR values may appear in either the IP list or the subnet list.
    """
    ip_obj = _parse_ip(client_ip)
    if ip_obj is None:
        return False

    for raw in list(allowed_ips or []) + list(allowed_subnets or []):
        entry = str(raw or "").strip()
        if not entry:
            continue
        if entry.lower() == "localhost" and str(ip_obj) in ("127.0.0.1", "::1"):
            return True
        if "/" in entry:
            try:
                network = ipaddress.ip_network(entry, strict=False)
                if ip_obj in network:
                    return True
            except ValueError:
                continue
        else:
            allowed_obj = _parse_ip(entry)
            if allowed_obj is not None and ip_obj == allowed_obj:
                return True
    return False


def resolve_effective_client_ip(
    request_ip: Optional[str],
    detected_public_ip: Optional[str] = None,
) -> Optional[str]:
    """
    Prefer the public IP seen on the HTTP connection / trusted proxy.

    Browser apps behind Vite only expose 127.0.0.1 to the API. In that
    loopback case (and only then) we fall back to a client-detected public IP.
    Private Render/internal addresses are NOT treated as loopback, so a
    Postman X-Forwarded-For / body IP cannot spoof the office whitelist.
    """
    if is_public_ip(request_ip):
        return request_ip.strip() if request_ip else None
    if is_loopback_ip(request_ip) and detected_public_ip and is_public_ip(detected_public_ip):
        return detected_public_ip.strip()
    if request_ip and request_ip.strip():
        return request_ip.strip()
    return None


def calculate_haversine_distance(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Great-circle distance in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_METERS * c


MAX_GPS_AGE_SECONDS = 90


def gps_accuracy_cap(max_radius_meters: float) -> float:
    return max(float(max_radius_meters or 150), MAX_GPS_ACCURACY_METERS)


def classify_gps_fix(
    distance_meters: float,
    accuracy_meters: Optional[float],
    max_radius_meters: float,
) -> GpsFixClass:
    """
    Coarse guesses must not count as out-of-office.
    Out of range only when a tight accuracy circle cannot cover HQ.
    """
    radius = float(max_radius_meters or 150)
    cap = gps_accuracy_cap(radius)
    if accuracy_meters is None or accuracy_meters > cap:
        return "coarse"
    if distance_meters - accuracy_meters > radius:
        return "out_of_range"
    if distance_meters <= radius:
        return "in_range"
    return "coarse"


def _parse_gps_captured_at(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def validate_gps_freshness(
    accuracy_meters: Optional[float],
    gps_captured_at: Optional[str],
    max_radius_meters: float,
) -> Optional[str]:
    """Reject stale or city-level location. Returns an error string or None."""
    captured = _parse_gps_captured_at(gps_captured_at)
    if captured is None:
        return (
            "Location check failed: GPS timestamp missing or invalid. "
            "Refresh location and try again."
        )
    age = (datetime.now(timezone.utc) - captured).total_seconds()
    if age < -30:
        return "Location check failed: GPS timestamp is in the future."
    if age > MAX_GPS_AGE_SECONDS:
        return "Location check failed: GPS reading is stale. Refresh location and try again."

    if accuracy_meters is None:
        return (
            "Location check failed: GPS accuracy was not provided. "
            "Allow precise location and try again."
        )
    return None


def validate_gps_geofence(
    user_lat: Optional[float],
    user_lon: Optional[float],
    office_lat: float,
    office_lon: float,
    max_radius_meters: float = 100.0,
) -> Tuple[bool, float]:
    """Returns (is_valid, distance_in_meters). Missing coordinates fail closed."""
    if user_lat is None or user_lon is None:
        return False, float("inf")

    distance = calculate_haversine_distance(user_lat, user_lon, office_lat, office_lon)
    return distance <= max_radius_meters, distance


@dataclass
class PunchSecurityResult:
    authorized: bool
    error: Optional[str]
    ip_verified: bool
    gps_verified: bool
    distance_meters: Optional[float]
    client_ip: Optional[str]

    def __iter__(self):
        return iter((self.authorized, self.error))


def validate_punch_security(
    client_ip: Optional[str],
    user_lat: Optional[float],
    user_lon: Optional[float],
    is_wfh_approved: bool,
    settings: SecuritySettingsSchema,
    accuracy_meters: Optional[float] = None,
    gps_captured_at: Optional[str] = None,
) -> PunchSecurityResult:
    """
    Punch security:
    - Approved WFH may bypass both checks when allow_wfh_bypass is on.
    - Enabled checks are OR: office IP *or* in-range GPS is enough.
    - Tight GPS that cannot cover HQ always blocks (VPN/home).
    - Coarse GPS is ignored so office Wi-Fi can still allow check-in.
    """
    whitelist = collect_whitelist_entries(settings)
    ip_verified = False
    gps_verified = False
    distance: Optional[float] = None

    if is_wfh_approved and settings.allow_wfh_bypass:
        return PunchSecurityResult(
            authorized=True,
            error=None,
            ip_verified=False,
            gps_verified=False,
            distance_meters=None,
            client_ip=client_ip,
        )

    if settings.enforce_ip_whitelist:
        ip_verified = validate_client_ip(client_ip, whitelist, ())

    gps_out_of_range = False
    gps_unusable_reason: Optional[str] = None

    if settings.enforce_gps_geofence:
        if user_lat is None or user_lon is None:
            gps_unusable_reason = "browser did not provide GPS coordinates"
        else:
            freshness_error = validate_gps_freshness(
                accuracy_meters,
                gps_captured_at,
                settings.geofence_radius_meters,
            )
            if freshness_error:
                gps_unusable_reason = freshness_error
            else:
                _in_radius, dist = validate_gps_geofence(
                    user_lat,
                    user_lon,
                    settings.office_latitude,
                    settings.office_longitude,
                    settings.geofence_radius_meters,
                )
                distance = dist
                quality = classify_gps_fix(
                    dist,
                    accuracy_meters,
                    settings.geofence_radius_meters,
                )
                if quality == "in_range":
                    gps_verified = True
                elif quality == "out_of_range":
                    gps_out_of_range = True
                else:
                    gps_unusable_reason = (
                        f"Location is too coarse (±{float(accuracy_meters or 0):.0f}m) "
                        "to prove office presence"
                    )

    ip_required = settings.enforce_ip_whitelist
    gps_required = settings.enforce_gps_geofence
    proofs: List[bool] = []
    if ip_required:
        proofs.append(ip_verified)
    if gps_required:
        proofs.append(gps_verified)

    if gps_required and gps_out_of_range:
        km = (distance or 0) / 1000.0
        dist_label = f"{distance:.0f}m" if (distance or 0) < 1000 else f"{km:.1f} km"
        return PunchSecurityResult(
            authorized=False,
            error=(
                f"Location check failed: you are {dist_label} from the office "
                f"(limit {settings.geofence_radius_meters:.0f}m)."
            ),
            ip_verified=ip_verified,
            gps_verified=False,
            distance_meters=distance,
            client_ip=client_ip,
        )

    if not proofs or any(proofs):
        return PunchSecurityResult(
            authorized=True,
            error=None,
            ip_verified=ip_verified if ip_required else True,
            gps_verified=gps_verified if gps_required else True,
            distance_meters=distance,
            client_ip=client_ip,
        )

    shown = client_ip or "unknown"
    if ip_required and gps_required:
        error = (
            f"Check-in blocked: you are not on office Wi-Fi (IP '{shown}') "
            "and the browser could not confirm you are at the office. "
            "Connect to office Wi-Fi or allow location and try again."
        )
        if gps_unusable_reason:
            error = f"{error} ({gps_unusable_reason})"
    elif ip_required:
        error = (
            f"Wi-Fi / IP check failed: '{shown}' is not on the office whitelist. "
            "Only listed IPs can check in."
        )
    else:
        error = (
            "Location check failed: GPS coordinates were not provided. "
            "Allow location access and try again."
        )

    return PunchSecurityResult(
        authorized=False,
        error=error,
        ip_verified=ip_verified,
        gps_verified=gps_verified,
        distance_meters=distance,
        client_ip=client_ip,
    )


def first_public_ip(candidates: Iterable[Optional[str]]) -> Optional[str]:
    for value in candidates:
        if value and is_public_ip(value):
            return value.strip()
    return None
