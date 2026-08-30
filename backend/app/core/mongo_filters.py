"""Safe MongoDB filter helpers — always escape user input used in $regex."""
import re
from typing import Any, Dict


def exact_ci(value: str) -> Dict[str, Any]:
    """Case-insensitive exact match via escaped regex."""
    return {"$regex": f"^{re.escape(value.strip())}$", "$options": "i"}


def contains_ci(value: str) -> Dict[str, Any]:
    """Case-insensitive substring match via escaped regex."""
    return {"$regex": re.escape(value.strip()), "$options": "i"}
