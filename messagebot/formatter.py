"""
Format new listing JSON into Telegram-friendly messages
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
