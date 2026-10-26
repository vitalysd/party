"""Add the initial Tea room once; deleting it must not recreate it on restart."""
from alembic import op
from sqlalchemy import select
from app.models.channel import Channel

revision = '20261024_tea_room'
down_revision = '20261024_baseline'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    table = Channel.__table__
    if not connection.execute(select(table.c.id).where(table.c.name == 'Чайхана', table.c.is_direct.is_(False))).first():
        connection.execute(table.insert().values(name='Чайхана', type='text', icon='coffee', is_direct=False))


def downgrade():
    pass  # Preserve user conversations.
