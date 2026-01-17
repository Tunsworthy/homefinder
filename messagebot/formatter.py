"""
Format new listing JSON and heartbeat messages into Telegram-friendly messages
"""
from typing import List, Dict, Any


def format_listings(payload: Dict[str, Any], frontend_url: str) -> List[str]:
    """
    Format new listings payload into Telegram messages.
    Splits into multiple messages if needed (Telegram has 4096 char limit).
    
    Returns:
        List of message strings ready to send
    """
    new_listings = payload.get("new_listings", [])
    count = payload.get("count", len(new_listings))
    
    if count == 0:
        return ["No new listings found."]
    
    # Header
    header = f"🏠 *{count} New Listing{'s' if count != 1 else ''} Found!*\n\n"
    
    messages = []
    current_message = header
    
    for idx, listing in enumerate(new_listings, 1):
        listing_text = _format_single_listing(listing, frontend_url)
        
        # Check if adding this listing would exceed Telegram's limit
        if len(current_message) + len(listing_text) > 3900:  # Leave buffer
            messages.append(current_message)
            current_message = listing_text
        else:
            current_message += listing_text
        
        # Add separator between listings (except last)
        if idx < len(new_listings):
            current_message += "\n────────────────────\n\n"
    
    messages.append(current_message)
    return messages


def format_heartbeat(payload: Dict[str, Any]) -> str:
    """Format a heartbeat message from backend pipeline"""
    heartbeat_type = payload.get("heartbeat_type", "pipeline_run")
    step_completed = payload.get("last_step_completed", 0)
    new_listings_count = payload.get("new_listings_count", 0)
    timestamp = payload.get("timestamp", "unknown")
    pipeline_run_id = payload.get("pipeline_run_id", "unknown")
    
    if heartbeat_type == "pipeline_run":
        if new_listings_count > 0:
            msg = f"💓 *Pipeline Heartbeat - Step {step_completed} Complete*\n"
            msg += f"✨ Found {new_listings_count} new listing(s)\n"
            msg += f"⏰ {timestamp}\n"
            msg += f"🆔 Run: `{pipeline_run_id}`\n"
        else:
            msg = f"💓 *Pipeline Heartbeat - Step {step_completed} Complete*\n"
            msg += f"ℹ️ No new listings found\n"
            msg += f"⏰ {timestamp}\n"
            msg += f"🆔 Run: `{pipeline_run_id}`\n"
        return msg
    
    return f"💓 Heartbeat received: {heartbeat_type}"


def format_rejection_summary(payload: Dict[str, Any]) -> str:
    """Format a rejection scanner summary message"""
    summary = payload.get("summary", {})
    rejected_ids = payload.get("rejected_ids", [])
    reviewed_ids = payload.get("reviewed_ids", [])
    timestamp = payload.get("timestamp", "unknown")
    
    total_voted = summary.get("total_voted", 0)
    marked_rejected = summary.get("marked_rejected", 0)
    marked_reviewed = summary.get("marked_reviewed", 0)
    left_unchanged = summary.get("left_unchanged", 0)
    
    # Build message
    msg = f"🔍 *Rejection Scanner Complete*\n\n"
    msg += f"📊 *Summary:*\n"
    msg += f"• Total listings with votes: {total_voted}\n"
    msg += f"• ✅ Marked as Reviewed: {marked_reviewed}\n"
    msg += f"• ❌ Marked as Rejected: {marked_rejected}\n"
    msg += f"• ⏺ Left unchanged: {left_unchanged}\n"
    msg += f"\n⏰ {timestamp}\n"
    
    # Add rejected IDs if any
    if rejected_ids:
        msg += f"\n🚫 *Rejected ({len(rejected_ids)}):*\n"
        # Show first 5 rejected IDs
        for lid in rejected_ids[:5]:
            msg += f"• `{lid}`\n"
        if len(rejected_ids) > 5:
            msg += f"• ... and {len(rejected_ids) - 5} more\n"
    
    # Add reviewed IDs if any
    if reviewed_ids:
        msg += f"\n✅ *Reviewed ({len(reviewed_ids)}):*\n"
        # Show first 5 reviewed IDs
        for lid in reviewed_ids[:5]:
            msg += f"• `{lid}`\n"
        if len(reviewed_ids) > 5:
            msg += f"• ... and {len(reviewed_ids) - 5} more\n"
    
    return msg


def _format_single_listing(listing: Dict[str, Any], frontend_url: str) -> str:
    """Format a single listing"""
    # Extract fields with fallbacks
    listing_id = listing.get("id", "unknown")
    address = listing.get("address", "Address not available")
    suburb = listing.get("suburb", "")
    price = listing.get("price", "Price not listed")
    bedrooms = listing.get("bedrooms", "?")
    bathrooms = listing.get("bathrooms", "?")
    parking = listing.get("parking", "?")
    property_type = listing.get("property_type", "Property")
    property_size = listing.get("property_size", "")
    agent_name = listing.get("agent_name")
    agent_phone = listing.get("agent_phone")
    domain_url = listing.get("url", "")
    
    # Build message
    msg = f"📍 *{address}*\n"
    msg += f"💰 {price}\n"
    msg += f"🛏 {bedrooms} bed | 🚿 {bathrooms} bath | 🚗 {parking} parking\n"
    
    if property_type or property_size:
        msg += f"🏘 {property_type}"
        if property_size:
            msg += f" · {property_size}"
        msg += "\n"
    
    msg += "\n"
    
    # Links
    msg += f"🔗 [View Details]({frontend_url}/listing/{listing_id})\n"
    if domain_url:
        msg += f"🌐 [Domain Listing]({domain_url})\n"
    
    # Agent info (if available)
    if agent_name or agent_phone:
        msg += "\n"
        if agent_name:
            msg += f"👤 {agent_name}"
        if agent_phone:
            if agent_name:
                msg += f" · {agent_phone}"
            else:
                msg += f"📞 {agent_phone}"
        msg += "\n"
    
    return msg
