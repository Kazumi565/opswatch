"""v0.2.0 control plane hardening and incident lifecycle

Revision ID: 4c4f6e2d9a6c
Revises: 3f3e7f8d7b5c
Create Date: 2026-03-13 18:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4c4f6e2d9a6c"
down_revision: str | None = "3f3e7f8d7b5c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "monitors",
        sa.Column("service", sa.String(length=120), nullable=False, server_default="unassigned"),
    )
    op.add_column(
        "monitors",
        sa.Column("environment", sa.String(length=80), nullable=False, server_default="dev"),
    )
    op.add_column(
        "monitors",
        sa.Column("owner", sa.String(length=120), nullable=False, server_default="unknown"),
    )
    op.add_column(
        "monitors",
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="medium"),
    )
    op.add_column(
        "monitors",
        sa.Column("runbook_url", sa.String(length=500), nullable=True),
    )

    op.add_column(
        "incidents",
        sa.Column("state", sa.String(length=20), nullable=False, server_default="open"),
    )
    op.add_column(
        "incidents",
        sa.Column("service", sa.String(length=120), nullable=False, server_default="unassigned"),
    )
    op.add_column(
        "incidents",
        sa.Column("environment", sa.String(length=80), nullable=False, server_default="dev"),
    )
    op.add_column(
        "incidents",
        sa.Column("owner", sa.String(length=120), nullable=False, server_default="unknown"),
    )
    op.add_column(
        "incidents",
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="medium"),
    )
    op.add_column(
        "incidents",
        sa.Column("runbook_url", sa.String(length=500), nullable=True),
    )

    op.execute(
        """
        UPDATE incidents
        SET state = CASE
            WHEN status = 'resolved' THEN 'resolved'
            ELSE 'open'
        END
        """
    )
    op.execute(
        """
        UPDATE incidents
        SET
            service = COALESCE((SELECT monitors.service FROM monitors WHERE monitors.id = incidents.monitor_id), 'unassigned'),
            environment = COALESCE((SELECT monitors.environment FROM monitors WHERE monitors.id = incidents.monitor_id), 'dev'),
            owner = COALESCE((SELECT monitors.owner FROM monitors WHERE monitors.id = incidents.monitor_id), 'unknown'),
            severity = COALESCE((SELECT monitors.severity FROM monitors WHERE monitors.id = incidents.monitor_id), 'medium'),
            runbook_url = (SELECT monitors.runbook_url FROM monitors WHERE monitors.id = incidents.monitor_id)
        """
    )

    op.create_table(
        "incident_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("incident_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("actor", sa.String(length=80), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("resource_type", sa.String(length=80), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        """
        INSERT INTO incident_events (incident_id, event_type, actor, note, created_at)
        SELECT id, 'opened', 'system', NULL, opened_at
        FROM incidents
        """
    )
    op.execute(
        """
        INSERT INTO incident_events (incident_id, event_type, actor, note, created_at)
        SELECT id, 'resolved', 'system', NULL, resolved_at
        FROM incidents
        WHERE state = 'resolved' AND resolved_at IS NOT NULL
        """
    )

    with op.batch_alter_table("incidents") as batch_op:
        batch_op.drop_column("status")
        batch_op.alter_column("state", server_default=None)
        batch_op.alter_column("service", server_default=None)
        batch_op.alter_column("environment", server_default=None)
        batch_op.alter_column("owner", server_default=None)
        batch_op.alter_column("severity", server_default=None)

    with op.batch_alter_table("monitors") as batch_op:
        batch_op.alter_column("service", server_default=None)
        batch_op.alter_column("environment", server_default=None)
        batch_op.alter_column("owner", server_default=None)
        batch_op.alter_column("severity", server_default=None)


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("incident_events")

    with op.batch_alter_table("incidents") as batch_op:
        batch_op.add_column(
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open")
        )

    op.execute(
        """
        UPDATE incidents
        SET status = CASE
            WHEN state = 'resolved' THEN 'resolved'
            ELSE 'open'
        END
        """
    )

    with op.batch_alter_table("incidents") as batch_op:
        batch_op.drop_column("runbook_url")
        batch_op.drop_column("severity")
        batch_op.drop_column("owner")
        batch_op.drop_column("environment")
        batch_op.drop_column("service")
        batch_op.drop_column("state")
        batch_op.alter_column("status", server_default=None)

    with op.batch_alter_table("monitors") as batch_op:
        batch_op.drop_column("runbook_url")
        batch_op.drop_column("severity")
        batch_op.drop_column("owner")
        batch_op.drop_column("environment")
        batch_op.drop_column("service")
