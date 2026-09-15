"""Base class for social lead ingestion adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseLeadAdapter(ABC):
    """Abstract interface for multi-channel lead ingestion."""

    platform_name: str = "generic"

    @abstractmethod
    async def process_payload(
        self,
        payload: Dict[str, Any],
        *,
        headers: Optional[Dict[str, str]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Normalize payload, extract attribution, deduplicate, and ingest lead."""
        pass
