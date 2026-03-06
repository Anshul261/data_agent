import bcrypt
from sqlalchemy import create_engine, text
from typing import Optional

_ENGINE_KWARGS = {"pool_pre_ping": True, "pool_recycle": 1800}


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def ensure_users_table(db_url: str) -> None:
    engine = create_engine(db_url, **_ENGINE_KWARGS)
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
    engine.dispose()


def get_user(username: str, db_url: str) -> Optional[dict]:
    engine = create_engine(db_url, **_ENGINE_KWARGS)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id::text, username, hashed_password, role FROM users WHERE username = :username"),
            {"username": username},
        ).fetchone()
    engine.dispose()
    if row is None:
        return None
    return {"id": row[0], "username": row[1], "hashed_password": row[2], "role": row[3]}


def create_user(username: str, password: str, role: str, db_url: str) -> dict:
    engine = create_engine(db_url, **_ENGINE_KWARGS)
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
    engine.dispose()
    return {"id": row[0], "username": row[1], "role": row[2]}


def admin_exists(db_url: str) -> bool:
    engine = create_engine(db_url, **_ENGINE_KWARGS)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        ).fetchone()
    engine.dispose()
    return (row[0] if row else 0) > 0
