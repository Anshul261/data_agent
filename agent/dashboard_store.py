import uuid
from functools import lru_cache
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import create_engine, text


_ENGINE_KWARGS = {"pool_pre_ping": True, "pool_recycle": 1800}


@lru_cache(maxsize=None)
def _get_engine(db_url: str):
    """
    One pooled engine per database URL, reused for the process lifetime.

    Building an engine per call opened a fresh TCP+TLS connection to Azure
    Postgres every time and made the pool settings above dead configuration.
    """
    return create_engine(db_url, **_ENGINE_KWARGS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dashboard_tables(db_url: str) -> None:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS saved_dashboards (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    description TEXT,
                    source_session_id TEXT,
                    layout JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS saved_dashboard_cards (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    dashboard_id UUID NOT NULL REFERENCES saved_dashboards(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    chart_type TEXT NOT NULL,
                    sql TEXT NOT NULL,
                    mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
                    presentation JSONB NOT NULL DEFAULT '{}'::jsonb,
                    insight TEXT,
                    last_result JSONB NOT NULL DEFAULT '[]'::jsonb,
                    last_error TEXT,
                    last_run_at TIMESTAMPTZ,
                    position JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_saved_dashboards_owner
                ON saved_dashboards(owner_user_id, updated_at DESC)
                """
            )
        )
        conn.commit()


def _row_to_dashboard(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "owner_user_id": str(row.owner_user_id),
        "name": row.name,
        "description": row.description,
        "source_session_id": row.source_session_id,
        "layout": row.layout or [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _row_to_card(row: Any) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "dashboard_id": str(row.dashboard_id),
        "title": row.title,
        "chart_type": row.chart_type,
        "sql": row.sql,
        "mapping": row.mapping or {},
        "presentation": row.presentation or {},
        "insight": row.insight,
        "last_result": row.last_result or [],
        "last_error": row.last_error,
        "last_run_at": row.last_run_at.isoformat() if row.last_run_at else None,
        "position": row.position or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def create_dashboard(
    db_url: str,
    *,
    owner_user_id: str,
    name: str,
    description: Optional[str],
    source_session_id: Optional[str],
    layout: list[dict[str, Any]],
    cards: list[dict[str, Any]],
) -> dict[str, Any]:
    engine = _get_engine(db_url)
    dashboard_id = str(uuid.uuid4())
    with engine.connect() as conn:
        dashboard_row = conn.execute(
            text(
                """
                INSERT INTO saved_dashboards
                    (id, owner_user_id, name, description, source_session_id, layout)
                VALUES
                    (:id, :owner_user_id, :name, :description, :source_session_id, CAST(:layout AS jsonb))
                RETURNING *
                """
            ),
            {
                "id": dashboard_id,
                "owner_user_id": owner_user_id,
                "name": name,
                "description": description,
                "source_session_id": source_session_id,
                "layout": _json_dumps(layout),
            },
        ).fetchone()

        card_rows = []
        for index, card in enumerate(cards):
            card_rows.append(
                conn.execute(
                    text(
                        """
                        INSERT INTO saved_dashboard_cards
                            (
                                dashboard_id, title, chart_type, sql, mapping,
                                presentation, insight, last_result, position, last_run_at
                            )
                        VALUES
                            (
                                :dashboard_id, :title, :chart_type, :sql,
                                CAST(:mapping AS jsonb), CAST(:presentation AS jsonb),
                                :insight, CAST(:last_result AS jsonb),
                                CAST(:position AS jsonb), NOW()
                            )
                        RETURNING *
                        """
                    ),
                    {
                        "dashboard_id": dashboard_id,
                        "title": card["title"],
                        "chart_type": card["chart_type"],
                        "sql": card["sql"],
                        "mapping": _json_dumps(card.get("mapping") or {}),
                        "presentation": _json_dumps(card.get("presentation") or {}),
                        "insight": card.get("insight"),
                        "last_result": _json_dumps(card.get("last_result") or []),
                        "position": _json_dumps(card.get("position") or {"order": index}),
                    },
                ).fetchone()
            )

        conn.commit()

    return {
        **_row_to_dashboard(dashboard_row),
        "cards": [_row_to_card(row) for row in card_rows],
    }


def list_dashboards(db_url: str, *, owner_user_id: str) -> list[dict[str, Any]]:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT d.*, COUNT(c.id) AS card_count
                FROM saved_dashboards d
                LEFT JOIN saved_dashboard_cards c ON c.dashboard_id = d.id
                WHERE d.owner_user_id = :owner_user_id
                GROUP BY d.id
                ORDER BY d.updated_at DESC
                """
            ),
            {"owner_user_id": owner_user_id},
        ).fetchall()

    dashboards = []
    for row in rows:
        item = _row_to_dashboard(row)
        item["card_count"] = row.card_count
        dashboards.append(item)
    return dashboards


def get_dashboard(
    db_url: str, *, dashboard_id: str, owner_user_id: str
) -> Optional[dict[str, Any]]:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        dashboard_row = conn.execute(
            text(
                """
                SELECT *
                FROM saved_dashboards
                WHERE id = :dashboard_id AND owner_user_id = :owner_user_id
                """
            ),
            {"dashboard_id": dashboard_id, "owner_user_id": owner_user_id},
        ).fetchone()

        if not dashboard_row:
            return None

        card_rows = conn.execute(
            text(
                """
                SELECT *
                FROM saved_dashboard_cards
                WHERE dashboard_id = :dashboard_id
                ORDER BY COALESCE((position->>'order')::int, 0), created_at
                """
            ),
            {"dashboard_id": dashboard_id},
        ).fetchall()

    return {
        **_row_to_dashboard(dashboard_row),
        "cards": [_row_to_card(row) for row in card_rows],
    }


def update_card_result(
    db_url: str,
    *,
    dashboard_id: str,
    card_id: str,
    owner_user_id: str,
    last_result: list[dict[str, Any]],
    last_error: Optional[str],
) -> Optional[dict[str, Any]]:
    engine = _get_engine(db_url)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                UPDATE saved_dashboard_cards
                SET
                    last_result = CAST(:last_result AS jsonb),
                    last_error = :last_error,
                    last_run_at = NOW(),
                    updated_at = NOW()
                WHERE id = :card_id
                  AND dashboard_id = (
                      SELECT id FROM saved_dashboards
                      WHERE id = :dashboard_id AND owner_user_id = :owner_user_id
                  )
                RETURNING *
                """
            ),
            {
                "dashboard_id": dashboard_id,
                "card_id": card_id,
                "owner_user_id": owner_user_id,
                "last_result": _json_dumps(last_result),
                "last_error": last_error,
            },
        ).fetchone()
        if row is None:
            conn.rollback()
            return None
        conn.execute(
            text("UPDATE saved_dashboards SET updated_at = NOW() WHERE id = :dashboard_id"),
            {"dashboard_id": dashboard_id},
        )
        conn.commit()
    return _row_to_card(row)


def _json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, default=str)

