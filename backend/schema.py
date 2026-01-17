"""
Pydantic schemas for MQTT message payloads and internal data structures.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class NewListingDetail(BaseModel):
    """Details of a single new listing for MQTT notification"""
    id: str
    address: str
    suburb: Optional[str] = None
    price: str
    status: str  # "active", "sold", "unknown"
    sold_price: Optional[str] = None
    headline: Optional[str] = None
    bedrooms: Optional[str] = None
    bathrooms: Optional[str] = None
    parking: Optional[str] = None
    property_type: Optional[str] = None
    property_size: Optional[str] = None
    agent_name: Optional[str] = None
    agent_phone: Optional[str] = None
    url: str
    image_urls: List[str] = Field(default_factory=list)


class NewListingsPayload(BaseModel):
    """MQTT message payload for new listings notification"""
    message_id: str
    timestamp: str  # ISO 8601 format
    step: int = 2
    pipeline_run_id: str
    new_listings: List[NewListingDetail]
    count: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "message_id": "msg_uuid_12345",
                "timestamp": "2025-01-17T14:30:00+10:00",
                "step": 2,
                "pipeline_run_id": "run_20250117_143000",
                "new_listings": [],
                "count": 0
            }
        }


class HeartbeatPayload(BaseModel):
    """Heartbeat message indicating backend is running"""
    message_id: str
    timestamp: str  # ISO 8601 format
    heartbeat_type: str = "pipeline_run"  # "pipeline_run", "step_complete", "health_check"
    pipeline_run_id: str
    last_step_completed: int  # Which step just finished
    new_listings_count: int = 0
    
    class Config:
        json_schema_extra = {
            "example": {
                "message_id": "hb_uuid_12345",
                "timestamp": "2025-01-17T14:30:00+10:00",
                "heartbeat_type": "pipeline_run",
                "pipeline_run_id": "run_20250117_143000",
                "last_step_completed": 2,
                "new_listings_count": 0
            }
        }


class StepSummary(BaseModel):
    """Summary of Step 1 execution"""
    pipeline_run_id: str
    step: int = 1
    step_name: str = "search_domain"
    timestamp: str  # ISO 8601 format
    status: str  # "success", "failed", "partial"
    execution_time_seconds: float
    metrics: Dict[str, Any]
    suburbs_targeted: List[str]
    search_criteria: Dict[str, Any]
    new_ids: List[str]  # List of newly discovered IDs
    output_files: List[Dict[str, Any]] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    
    class Config:
        json_schema_extra = {
            "example": {
                "pipeline_run_id": "run_20250117_143000",
                "step": 1,
                "step_name": "search_domain",
                "timestamp": "2025-01-17T14:30:00+10:00",
                "status": "success",
                "execution_time_seconds": 245.5,
                "metrics": {
                    "total_ids_found": 487,
                    "new_ids": 12,
                    "active_ids": 450,
                    "missing_ids": 37,
                    "pages_scraped": 8
                },
                "suburbs_targeted": ["Cheltenham NSW 2119", "Epping NSW 2121"],
                "search_criteria": {
                    "property_type": "free-standing",
                    "bedrooms": "3+",
                    "bathrooms": "2+",
                    "price_max": 2500000,
                    "exclude_under_offer": True
                },
                "new_ids": ["2018016977", "2018016978"],
                "output_files": [
                    {"path": "listing_ids.json", "size_bytes": 45230, "record_count": 487},
                    {"path": "step1_summary.json", "size_bytes": 1850, "record_count": 1}
                ],
                "errors": [],
                "warnings": []
            }
        }
