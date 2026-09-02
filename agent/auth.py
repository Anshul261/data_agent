import bcrypt
from functools import lru_cache
from sqlalchemy import create_engine, text
from typing import Optional

_ENGINE_KWARGS = {"pool_pre_ping": True, "pool_recycle": 1800}
_ALLOWED_ROLES = {"admin", "user"}


@lru_cache(maxsize=None)
def _get_engine(db_url: str):
    """
    One pooled engine per database URL, reused for the process lifetime.

    Building an engine per call opened a fresh TCP+TLS connection to Azure
    Postgres every time and made the pool settings above dead configuration.
    """
    return create_engine(db_url, **_ENGINE_KWARGS)


def hash_password(plain: str) -> str:
    if len(plain) < 12:
        raise ValueError("Password must be at least 12 characters long")
    if len(plain.encode()) > 72:
        raise ValueError("Password must be 72 bytes or fewer")
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    if len(plain.encode()) > 72:
        return False
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def ensure_users_table(db_url: str) -> None:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(50) UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.commit()


def get_user(username: str, db_url: str) -> Optional[dict]:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id::text, username, hashed_password, role FROM users WHERE username = :username"),
            {"username": username},
        ).fetchone()
    if row is None:
        return None
    return {"id": row[0], "username": row[1], "hashed_password": row[2], "role": row[3]}


def create_user(username: str, password: str, role: str, db_url: str) -> dict:
    username = username.strip()
    if not username or len(username) > 50:
        raise ValueError("Username must be between 1 and 50 characters")
    if role not in _ALLOWED_ROLES:
        raise ValueError("Invalid user role")
    engine = _get_engine(db_url)
    hashed = hash_password(password)
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO users (username, hashed_password, role)
                VALUES (:username, :hashed, :role)
                RETURNING id::text, username, role
            """),
            {"username": username, "hashed": hashed, "role": role},
        ).fetchone()
        conn.commit()
    return {"id": row[0], "username": row[1], "role": row[2]}


def update_user_password(username: str, password: str, db_url: str) -> bool:
    username = username.strip()
    engine = _get_engine(db_url)
    hashed = hash_password(password)
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                UPDATE users
                SET hashed_password = :hashed
                WHERE username = :username
            """),
            {"username": username, "hashed": hashed},
        )
        conn.commit()
    return result.rowcount > 0


def admin_exists(db_url: str) -> bool:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        ).fetchone()
    return (row[0] if row else 0) > 0
