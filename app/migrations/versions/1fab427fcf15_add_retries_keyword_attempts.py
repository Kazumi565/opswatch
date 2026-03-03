"""add retries keyword attempts

Revision ID: 1fab427fcf15
Revises: 5cbfd6f9a53a
Create Date: 2026-02-25 17:57:08.747741

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1fab427fcf15'
down_revision: Union[str, None] = '5cbfd6f9a53a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("monitors", sa.Column("retries", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("monitors", sa.Column("http_keyword", sa.Text(), nullable=True))
    op.add_column("check_runs", sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"))

    op.alter_column("monitors", "retries", server_default=None)
    op.alter_column("check_runs", "attempts", server_default=None)

def downgrade() -> None:
    op.drop_column("check_runs", "attempts")
    op.drop_column("monitors", "http_keyword")
    op.drop_column("monitors", "retries")
