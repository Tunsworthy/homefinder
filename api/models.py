"""SQLAlchemy models for housefinder application."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, Text, TIMESTAMP, 
    ForeignKey, Index, JSON, CheckConstraint
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    """User accounts for authentication."""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default='user')  # user, admin
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    votes = relationship('Vote', back_populates='user', cascade='all, delete-orphan')
    comments = relationship('Comment', back_populates='user', cascade='all, delete-orphan')
    
    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"


class Listing(Base):
    """Property listings."""
    __tablename__ = 'listings'
    
    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(100), unique=True, nullable=False, index=True)  # Domain listing ID
    address = Column(String(500))
    price = Column(String(100))
    bedrooms = Column(Integer)
    bathrooms = Column(Integer)
    property_type = Column(String(100), index=True)
    url = Column(String(1000))
    image = Column(String(1000))  # Primary image
    images = Column(JSON)  # Array of all images
    status = Column(String(50), default='available', index=True)  # available, sold, off_market
    raw_data = Column(JSON)  # Store full original listing data
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    votes = relationship('Vote', back_populates='listing', cascade='all, delete-orphan')
    comments = relationship('Comment', back_populates='listing', cascade='all, delete-orphan')
    commutes = relationship('Commute', back_populates='listing', cascade='all, delete-orphan')
    
    # Indexes
    __table_args__ = (
        Index('idx_listing_status_created', 'status', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Listing(id={self.id}, external_id='{self.external_id}', address='{self.address}')>"


class Vote(Base):
    """User votes on listings."""
    __tablename__ = 'votes'
    
    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey('listings.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    value = Column(Boolean)  # True=yes, False=no, None=not voted
    score = Column(Integer)  # 1-5 rating
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    listing = relationship('Listing', back_populates='votes')
    user = relationship('User', back_populates='votes')
    
    # Constraints
    __table_args__ = (
        Index('idx_vote_listing_user', 'listing_id', 'user_id', unique=True),
        CheckConstraint('score IS NULL OR (score >= 1 AND score <= 5)', name='check_score_range'),
    )
    
    def __repr__(self):
        return f"<Vote(id={self.id}, listing_id={self.listing_id}, user_id={self.user_id}, value={self.value}, score={self.score})>"


class Comment(Base):
    """User comments on listings."""
    __tablename__ = 'comments'
    
    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey('listings.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    listing = relationship('Listing', back_populates='comments')
    user = relationship('User', back_populates='comments')
    
    # Indexes
    __table_args__ = (
        Index('idx_comment_listing_created', 'listing_id', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Comment(id={self.id}, listing_id={self.listing_id}, user_id={self.user_id})>"


class Commute(Base):
    """Commute information for listings."""
    __tablename__ = 'commutes'
    
    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey('listings.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    commutes_data = Column(JSON)  # Array of commute objects
    nearest_station = Column(JSON)  # Nearest station info
    travel_seconds = Column(Integer, index=True)  # For sorting/filtering
    created_at = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    listing = relationship('Listing', back_populates='commutes')
    
    def __repr__(self):
        return f"<Commute(id={self.id}, listing_id={self.listing_id}, travel_seconds={self.travel_seconds})>"
