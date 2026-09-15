"""Multi-platform CRM lead ingestion adapters."""
from app.services.crm_adapters.base import BaseLeadAdapter
from app.services.crm_adapters.generic_form import GenericFormAdapter
from app.services.crm_adapters.google_ads import GoogleAdsLeadAdapter
from app.services.crm_adapters.meta import MetaLeadAdapter

__all__ = [
    "BaseLeadAdapter",
    "GenericFormAdapter",
    "GoogleAdsLeadAdapter",
    "MetaLeadAdapter",
]
