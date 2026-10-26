"""Timestamp existing uploads without expiring any pre-migration file immediately."""
from alembic import op
import sqlalchemy as sa
revision = '20261026_upload_retention'
down_revision = '20261024_tea_room'
branch_labels = None
depends_on = None

def upgrade():
    if any(column['name'] == 'created_at' for column in sa.inspect(op.get_bind()).get_columns('uploaded_files')):
        return
    op.add_column('uploaded_files', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))

def downgrade():
    op.drop_column('uploaded_files', 'created_at')
