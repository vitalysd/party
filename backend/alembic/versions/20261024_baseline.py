"""Adopt existing schema and create the access/idempotency tables if missing.

This baseline does not alter existing columns or remove data. Future schema
changes must be explicit revisions, not edits to this baseline.
"""
from alembic import op
from app.core.database import Base
import app.models  # noqa: F401

revision = '20261024_baseline'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)

def downgrade():
    raise RuntimeError('Restore a verified backup to undo baseline adoption; no automatic data deletion')
