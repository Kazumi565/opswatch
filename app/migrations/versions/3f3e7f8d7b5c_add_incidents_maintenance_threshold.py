"""add incident threshold, incidents, and maintenance windows

Revision ID: 3f3e7f8d7b5c
Revises: 1fab427fcf15
Create Date: 2026-03-13 10:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f3e7f8d7b5c"
down_revision: str | None = "1fab427fcf15"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "monitors",
        sa.Column("incident_threshold", sa.Integer(), nullable=False, server_default="3"),
    )
    with op.batch_alter_table("monitors") as batch_op:
        batch_op.alter_column("incident_threshold", server_default=None)

    op.create_table(
        "incidents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("monitor_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["monitor_id"], ["monitors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "maintenance_windows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("monitor_id", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["monitor_id"], ["monitors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("maintenance_windows")
    op.drop_table("incidents")
    op.drop_column("monitors", "incident_threshold")
