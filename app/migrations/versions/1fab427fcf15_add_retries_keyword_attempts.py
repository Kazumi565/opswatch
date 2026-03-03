"""add retries keyword attempts

Revision ID: 1fab427fcf15
Revises: 5cbfd6f9a53a
Create Date: 2026-02-25 17:57:08.747741

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1fab427fcf15"
down_revision: str | None = "5cbfd6f9a53a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "monitors", sa.Column("retries", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("monitors", sa.Column("http_keyword", sa.Text(), nullable=True))
    op.add_column(
        "check_runs", sa.Column("attempts", sa.Integer(), nullable=False, server_default="1")
    )

    op.alter_column("monitors", "retries", server_default=None)
    op.alter_column("check_runs", "attempts", server_default=None)


def downgrade() -> None:
    op.drop_column("check_runs", "attempts")
    op.drop_column("monitors", "http_keyword")
    op.drop_column("monitors", "retries")
