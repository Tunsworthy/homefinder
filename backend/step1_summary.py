"""
Step 1 Summary Generator
Produces a JSON summary of Step 1 execution with new listing IDs and metrics.
"""

import json
import os
import uuid
from datetime import datetime
from typing import Dict, Any, List

from schema import StepSummary


def generate_pipeline_run_id() -> str:
    """Generate a unique pipeline run ID"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"run_{timestamp}_{uuid.uuid4().hex[:8]}"


def write_step1_summary(
    existing_ids: Dict[str, Any],
    current_ids: set,
    data_dir: str = ".",
    execution_time_seconds: float = 0.0,
    suburbs_targeted: List[str] = None,
    errors: List[str] = None,
    warnings: List[str] = None,
) -> str:
    """
    Write Step 1 execution summary to JSON file.
    
    Args:
        existing_ids: Dict of all tracked IDs (old + new)
        current_ids: Set of IDs found in current run
        data_dir: Directory to save summary file
        execution_time_seconds: Time taken to execute step
        suburbs_targeted: List of suburbs searched
        errors: List of errors encountered
        warnings: List of warnings
        
    Returns:
        Path to saved summary file
    """
    
    # Identify new IDs (added in this run)
    new_ids = []
    for listing_id in current_ids:
        if listing_id not in existing_ids or existing_ids[listing_id].get("added_date") == datetime.now().strftime("%Y-%m-%d"):
            new_ids.append(listing_id)
    
    # Calculate metrics
    active_count = sum(1 for v in existing_ids.values() if v.get("status") == "active")
    missing_count = sum(1 for v in existing_ids.values() if v.get("status") == "missing")
    
    # Build search criteria
    search_criteria = {
        "property_type": "free-standing",
        "bedrooms": "3+",
        "bathrooms": "2+",
        "price_max": 2500000,
        "exclude_under_offer": True,
    }
    
    # Create summary object
    summary = StepSummary(
        pipeline_run_id=generate_pipeline_run_id(),
        step=1,
        step_name="search_domain",
        timestamp=datetime.now().isoformat(),
        status="success" if not errors else "partial" if warnings else "failed",
        execution_time_seconds=execution_time_seconds,
        metrics={
            "total_ids_found": len(existing_ids),
            "new_ids": len(new_ids),
            "active_ids": active_count,
            "missing_ids": missing_count,
            "pages_scraped": 0,  # Can be tracked separately if needed
        },
        suburbs_targeted=suburbs_targeted or [],
        search_criteria=search_criteria,
        new_ids=new_ids,
        output_files=[
            {
                "path": "listing_ids.json",
                "size_bytes": 0,  # Will be calculated
                "record_count": len(existing_ids),
            },
        ],
        errors=errors or [],
        warnings=warnings or [],
    )
    
    # Save to file
    summary_file = os.path.join(data_dir, "step1_summary.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary.dict(), f, indent=2, ensure_ascii=False)
    
    return summary_file, summary


def read_step1_summary(data_dir: str = ".") -> Dict[str, Any]:
    """
    Read Step 1 summary from JSON file.
    
    Args:
        data_dir: Directory containing summary file
        
    Returns:
        Summary dict, or empty dict if file not found
    """
    summary_file = os.path.join(data_dir, "step1_summary.json")
    
    if not os.path.exists(summary_file):
        return {}
    
    try:
        with open(summary_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠ Error reading step1_summary.json: {e}")
        return {}
