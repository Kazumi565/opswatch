import argparse
import getpass

from db import SessionLocal
from models import User, UserRole
from security import hash_password, normalize_email
from sqlalchemy import select


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the first OpsWatch admin user.")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--display-name", required=True, help="Admin display name")
    parser.add_argument(
        "--password",
        help="Admin password. If omitted, the command prompts securely.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    password = args.password or getpass.getpass("Password: ")
    if len(password) < 8:
        raise SystemExit("password must be at least 8 characters")

    email = normalize_email(args.email)
    display_name = args.display_name.strip()
    if not display_name:
        raise SystemExit("display name must not be empty")

    with SessionLocal() as db:
        existing_user = db.scalar(select(User.id).limit(1))
        if existing_user is not None:
            raise SystemExit("bootstrap admin creation is only allowed when no users exist")

        user = User(
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
            role=UserRole.admin,
            is_active=True,
        )
        db.add(user)
        db.commit()

    print(f"Created bootstrap admin user {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
