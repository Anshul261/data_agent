"""
Tests for the read-only SQL guard.

This is the layer that decides which queries reach ClickHouse, so both
directions matter: unsafe queries must be rejected, and ordinary analytics
queries must not be rejected by accident.
"""

import pytest

from sql_guard import SqlGuard, mask_literals, sub_outside_literals
import re


@pytest.fixture
def guard():
    return SqlGuard(
        configured_table_name="LLM_access_tickets",
        resolved_table_name="LLM_access_tickets",
        table_fqn="tickets_db.LLM_access_tickets",
    )


# --- literal and comment masking -------------------------------------------


@pytest.mark.parametrize(
    "sql,expected",
    [
        ("SELECT 'DELETE'", "SELECT '      '"),
        ("SELECT 'it''s'", "SELECT '     '"),
        (r"SELECT 'a\'b'", "SELECT '    '"),
        ("SELECT 1 -- DROP TABLE x", "SELECT 1 -              "),
        ("SELECT /* DROP */ 1", "SELECT /          1"),
    ],
)
def test_mask_literals_blanks_bodies_and_preserves_length(sql, expected):
    masked = mask_literals(sql)
    assert len(masked) == len(sql)
    assert masked == expected


def test_sub_outside_literals_leaves_quoted_text_alone():
    pattern = re.compile(r"\btickets\b")
    sql = "SELECT * FROM tickets WHERE note = 'see tickets table'"
    assert sub_outside_literals(pattern, "db.tickets", sql) == (
        "SELECT * FROM db.tickets WHERE note = 'see tickets table'"
    )


# --- queries that must be allowed ------------------------------------------


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT count() FROM LLM_access_tickets",
        "SELECT * FROM tickets_db.LLM_access_tickets LIMIT 10",
        "SELECT status, count() FROM LLM_access_tickets GROUP BY status",
        "SHOW TABLES",
        "DESCRIBE LLM_access_tickets",
        "DESC TABLE LLM_access_tickets",
        "SELECT count() FROM LLM_access_tickets;",
        # Keywords inside string literals are data, not statements.
        "SELECT count() FROM LLM_access_tickets WHERE action = 'DELETE'",
        "SELECT count() FROM LLM_access_tickets WHERE note = 'drop the ticket'",
        "SELECT count() FROM LLM_access_tickets WHERE t = 'a;b'",
        # A comment must not trip the keyword scan either.
        "SELECT count() FROM LLM_access_tickets -- update later",
        "SELECT count() FROM LLM_access_tickets WHERE x = 'INSERT INTO y'",
    ],
)
def test_allows_legitimate_queries(guard, sql):
    is_valid, error = guard.validate_read_only(sql)
    assert is_valid, f"wrongly rejected: {sql!r} -> {error}"


# --- queries that must be rejected -----------------------------------------


@pytest.mark.parametrize(
    "sql,reason",
    [
        ("DROP TABLE LLM_access_tickets", "mutating"),
        ("INSERT INTO LLM_access_tickets VALUES (1)", "mutating"),
        ("ALTER TABLE LLM_access_tickets ADD COLUMN x Int", "mutating"),
        ("TRUNCATE TABLE LLM_access_tickets", "mutating"),
        ("SYSTEM SHUTDOWN", "mutating"),
        ("SELECT 1 FROM LLM_access_tickets; DROP TABLE x", "multi-statement"),
        ("SELECT * FROM system.tables", "other table"),
        ("SELECT * FROM users", "other table"),
        ("SELECT * FROM LLM_access_tickets JOIN users ON 1=1", "join to other table"),
        ("DESCRIBE users", "schema of other table"),
        ("SELECT 1 FROM LLM_access_tickets FORMAT CSV", "format clause"),
        ("SELECT 1 FROM LLM_access_tickets INTO OUTFILE '/tmp/x'", "export"),
        ("SELECT * FROM url('http://evil/x', CSV)", "table function"),
        ("SELECT 1", "no table reference"),
    ],
)
def test_rejects_unsafe_queries(guard, sql, reason):
    is_valid, error = guard.validate_read_only(sql)
    assert not is_valid, f"wrongly allowed ({reason}): {sql!r}"
    assert error.startswith("Error:")


def test_semicolon_inside_literal_is_not_a_second_statement(guard):
    ok, _ = guard.validate_read_only(
        "SELECT count() FROM LLM_access_tickets WHERE msg = 'a;b'"
    )
    assert ok


def test_comment_cannot_hide_a_disallowed_table(guard):
    ok, _ = guard.validate_read_only("SELECT * FROM /* x */ users")
    assert not ok


# --- table rewriting --------------------------------------------------------


def test_rewrite_qualifies_bare_table_name(guard):
    assert guard.rewrite_table_references("SELECT * FROM LLM_access_tickets") == (
        "SELECT * FROM tickets_db.LLM_access_tickets"
    )


def test_rewrite_does_not_touch_string_literals(guard):
    sql = "SELECT * FROM LLM_access_tickets WHERE note = 'LLM_access_tickets'"
    assert guard.rewrite_table_references(sql) == (
        "SELECT * FROM tickets_db.LLM_access_tickets WHERE note = 'LLM_access_tickets'"
    )


def test_rewrite_is_idempotent_on_already_qualified_names(guard):
    sql = "SELECT * FROM tickets_db.LLM_access_tickets"
    assert guard.rewrite_table_references(sql) == sql


# --- dashboard queries are stricter ----------------------------------------


def test_dashboard_allows_select(guard):
    ok, _ = guard.validate_dashboard("SELECT count() FROM LLM_access_tickets")
    assert ok


@pytest.mark.parametrize(
    "sql",
    [
        "SHOW TABLES",
        "DESCRIBE LLM_access_tickets",
        "EXPLAIN SELECT 1 FROM LLM_access_tickets",
        "DROP TABLE LLM_access_tickets",
        "SELECT 1 FROM LLM_access_tickets; SELECT 2",
    ],
)
def test_dashboard_rejects_non_select(guard, sql):
    ok, _ = guard.validate_dashboard(sql)
    assert not ok


def test_dashboard_accepts_literal_containing_keyword(guard):
    ok, error = guard.validate_dashboard(
        "SELECT count() FROM LLM_access_tickets WHERE action = 'DROP'"
    )
    assert ok, error
