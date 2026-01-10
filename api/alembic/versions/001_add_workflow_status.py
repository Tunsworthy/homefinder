"""Add workflow_status to listings

Revision ID: 001
Revises: 
Create Date: 2026-01-11

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Add workflow_status column to listings table
    op.add_column('listings', sa.Column('workflow_status', sa.String(50), nullable=True, server_default='active'))
    
    # Create index on workflow_status
    op.create_index('idx_listing_workflow_status', 'listings', ['workflow_status'])
    
    # Update existing records to have 'active' status
    op.execute("UPDATE listings SET workflow_status = 'active' WHERE workflow_status IS NULL")
    
    # Make the column non-nullable after setting defaults
    op.alter_column('listings', 'workflow_status', nullable=False)


def downgrade():
    # Remove index
    op.drop_index('idx_listing_workflow_status', table_name='listings')
    
    # Remove column
    op.drop_column('listings', 'workflow_status')
