"""
Security and Geofencing Validators for Attendance Check-In / Check-Out.
Enforces Tier 1 Office IP / Subnet Whitelisting and Tier 3 GPS Haversine Geofencing.
"""
import ipaddress
import math
from typing import Optional, List, Tuple
from app.schemas.attendance import SecuritySettingsSchema


EARTH_RADIUS_METERS: float = 6371000.0


def validate_client_ip(
    client_ip: Optional[str],
    allowed_ips: List[str],
    allowed_subnets: List[str],
) -> bool:
    """
    Tier 1 Security: Validates whether client_ip matches an allowed IP or falls within an allowed CIDR subnet.
    """
    if not client_ip:
        return False

    clean_ip = client_ip.strip()
    if clean_ip in ("127.0.0.1", "::1", "localhost"):
        return True

    # 1. Exact match in allowed_ips
    for ip in allowed_ips:
        if clean_ip == ip.strip():
            return True

    # 2. Check if clean_ip falls in any CIDR subnet block
    try:
        ip_obj = ipaddress.ip_address(clean_ip)
    except ValueError:
        return False

    for subnet_str in allowed_subnets:
        try:
            network = ipaddress.ip_network(subnet_str.strip(), strict=False)
            if ip_obj in network:
                return True
        except ValueError:
            continue

    return False


def calculate_haversine_distance(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculates great-circle distance between two GPS coordinates using the Haversine formula.
    Returns distance in meters.
    """
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


def validate_gps_geofence(
    user_lat: Optional[float],
    user_lon: Optional[float],
    office_lat: float,
    office_lon: float,
    max_radius_meters: float = 100.0,
) -> Tuple[bool, float]:
    """
    Tier 3 Security: Validates whether user coordinates are within max_radius_meters of the office coordinates.
    Returns (is_valid, distance_in_meters).
    """
    if user_lat is None or user_lon is None:
        return False, float("inf")

    distance = calculate_haversine_distance(user_lat, user_lon, office_lat, office_lon)
    is_valid = distance <= max_radius_meters
    return is_valid, distance


def validate_punch_security(
    client_ip: Optional[str],
    user_lat: Optional[float],
    user_lon: Optional[float],
    is_wfh_approved: bool,
    settings: SecuritySettingsSchema,
) -> Tuple[bool, Optional[str]]:
    """
    Comprehensive punch security validator:
    - Automatically bypasses IP/GPS checks if and only if employee has an approved WFH request.
    - Tier 1: Validates office IP / subnet whitelist.
    - Tier 3: Validates GPS geofence radius.
    When both are enabled:
      * Being on the verified office network / IP confirms physical presence in office.
      * When on an external network, GPS Geofencing strictly validates physical proximity to HQ.
    """
    # 1. Approved WFH Bypass
    if is_wfh_approved and settings.allow_wfh_bypass:
        return True, None

    # Evaluate Tier 1 IP Whitelist
    is_ip_valid = False
    if settings.enforce_ip_whitelist:
        is_ip_valid = validate_client_ip(
            client_ip,
            settings.office_public_ips,
            settings.office_subnets,
        )

    # Evaluate Tier 3 GPS Geofence
    is_gps_valid = False
    dist = 0.0
    if settings.enforce_gps_geofence:
        if user_lat is not None and user_lon is not None:
            is_gps_valid, dist = validate_gps_geofence(
                user_lat,
                user_lon,
                settings.office_latitude,
                settings.office_longitude,
                settings.geofence_radius_meters,
            )

    # When both Tier 1 and Tier 3 are enabled:
    if settings.enforce_ip_whitelist and settings.enforce_gps_geofence:
        if is_ip_valid or is_gps_valid:
            return True, None
        return False, f"Access denied: IP address '{client_ip}' is external and GPS location ({dist:.1f}m away) is outside the {settings.geofence_radius_meters:.0f}m office perimeter."

    # If only Tier 1 is enforced:
    if settings.enforce_ip_whitelist and not is_ip_valid:
        return False, f"Access denied: Check-in IP address '{client_ip}' is not within the authorized office network."

    # If only Tier 3 is enforced:
    if settings.enforce_gps_geofence and not is_gps_valid:
        return False, f"Access denied: Location ({dist:.1f}m away) is outside the authorized {settings.geofence_radius_meters:.0f}-meter office perimeter."

    return True, None
