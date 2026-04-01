"""add user auth and rbac

Revision ID: 8d4b7a8a1d2e
Revises: 4c4f6e2d9a6c
Create Date: 2026-04-01 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "8d4b7a8a1d2e"
down_revision: str | None = "4c4f6e2d9a6c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    user_role = postgresql.ENUM(
        "user",
        "programmer",
        "admin",
        name="userrole",
        create_type=False,
    )
    user_role.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_auth_sessions_user_id"), "auth_sessions", ["user_id"], unique=False)

    with op.batch_alter_table("incident_events") as batch_op:
        batch_op.alter_column(
            "actor",
            existing_type=sa.String(length=80),
            type_=sa.String(length=320),
            existing_nullable=False,
        )

    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.alter_column(
            "actor",
            existing_type=sa.String(length=80),
            type_=sa.String(length=320),
            existing_nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    user_role = postgresql.ENUM(
        "user",
        "programmer",
        "admin",
        name="userrole",
        create_type=False,
    )

    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.alter_column(
            "actor",
            existing_type=sa.String(length=320),
            type_=sa.String(length=80),
            existing_nullable=False,
        )

    with op.batch_alter_table("incident_events") as batch_op:
        batch_op.alter_column(
            "actor",
            existing_type=sa.String(length=320),
            type_=sa.String(length=80),
            existing_nullable=False,
        )

    op.drop_index(op.f("ix_auth_sessions_user_id"), table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_table("users")

    user_role.drop(bind, checkfirst=True)
