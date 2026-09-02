"""
Read-only SQL validation for ClickHouse access.

Extracted from agent.py so it can be tested without standing up Azure
Postgres, ClickHouse, and an LLM client. This module has no project
dependencies and no import-time side effects: the allowed-table
configuration is injected, not resolved from the environment.

The guard is one layer only. ClickHouse's own `readonly=1` setting is the
authoritative protection; this exists to give the agent clear errors and to
keep obviously-wrong queries from reaching the database at all.
"""

import re

READ_ONLY_PREFIXES = ("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN")

DISALLOWED_SQL_KEYWORDS = {
    "ALTER",
    "ATTACH",
    "CREATE",
    "DELETE",
    "DETACH",
    "DROP",
    "GRANT",
    "INSERT",
    "KILL",
    "OPTIMIZE",
    "RENAME",
    "REVOKE",
    "SYSTEM",
    "TRUNCATE",
    "UPDATE",
    "USE",
}

TABLE_REFERENCE_PATTERN = re.compile(
    r"""(?ix)
    \b(?:from|join)\s+
    (
        (?:
            [`"]?[a-zA-Z_][\w]*[`"]?\.
        )?
        [`"]?[a-zA-Z_][\w]*[`"]?
    )
    """
)

# Quoted literals and comments must not be scanned for keywords or table
# names: `WHERE action = 'DELETE'` is a legitimate query, and a table name
# inside a string is data rather than a reference.
STRING_LITERAL_PATTERN = re.compile(
    r"""
    '(?:''|\\.|[^'\\])*'      # single-quoted literal, '' or backslash escapes
    | --[^\n]*                # line comment
    | /\*.*?\*/               # block comment
    """,
    re.X | re.S,
)


def mask_literals(sql_query: str) -> str:
    """
    Blank out literal and comment bodies, preserving length and quoting.

    Keeps character offsets stable so masked and raw text stay aligned.
    """

    def blank(match: re.Match) -> str:
        body = match.group(0)
        # Keep both quotes on a literal so the masked text stays balanced;
        # comments only need their opening marker.
        if body.startswith("'") and len(body) >= 2:
            return "'" + " " * (len(body) - 2) + "'"
        return body[0] + " " * (len(body) - 1)

    return STRING_LITERAL_PATTERN.sub(blank, sql_query)


def sub_outside_literals(
    pattern: re.Pattern, replacement: str, sql_query: str
) -> str:
    """Apply a substitution only to the parts of a query that are code."""
    chunks: list[str] = []
    cursor = 0
    for match in STRING_LITERAL_PATTERN.finditer(sql_query):
        chunks.append(pattern.sub(replacement, sql_query[cursor : match.start()]))
        chunks.append(match.group(0))
        cursor = match.end()
    chunks.append(pattern.sub(replacement, sql_query[cursor:]))
    return "".join(chunks)


def normalize_identifier(identifier: str) -> str:
    return identifier.replace("`", "").replace('"', "").strip().lower()


class SqlGuard:
    """Validates queries against a single allowed table."""

    def __init__(
        self,
        *,
        configured_table_name: str,
        resolved_table_name: str,
        table_fqn: str,
    ):
        self.configured_table_name = configured_table_name
        self.resolved_table_name = resolved_table_name
        self.table_fqn = table_fqn
        self.allowed_identifiers = {
            normalize_identifier(configured_table_name),
            normalize_identifier(resolved_table_name),
            normalize_identifier(table_fqn),
        }
        self._rewrite_pattern = re.compile(
            rf"""(?ix)
            (?<![\w.])
            {re.escape(configured_table_name)}
            (?![\w])
            """
        )

    def is_allowed_table(self, identifier: str) -> bool:
        return normalize_identifier(identifier) in self.allowed_identifiers

    def rewrite_table_references(self, sql_query: str) -> str:
        """Qualify bare references to the allowed table, ignoring literals."""
        return sub_outside_literals(
            self._rewrite_pattern, self.table_fqn, sql_query
        )

    def extract_referenced_tables(self, sql_query: str) -> set[str]:
        return {
            normalize_identifier(match.group(1))
            for match in TABLE_REFERENCE_PATTERN.finditer(mask_literals(sql_query))
        }

    def validate_read_only(self, sql_query: str) -> tuple[bool, str]:
        stripped_query = sql_query.strip()
        masked_query = mask_literals(stripped_query)
        normalized_masked = (
            masked_query[:-1].strip()
            if masked_query.rstrip().endswith(";")
            else masked_query
        )

        if ";" in normalized_masked:
            return False, "Error: Only a single SQL statement is allowed."
        if re.search(r"(?is)\bFORMAT\s+\w+\b", normalized_masked):
            return False, "Error: FORMAT clauses are not allowed."
        if re.search(r"(?is)\bINTO\s+OUTFILE\b", normalized_masked):
            return False, "Error: Export clauses are not allowed."

        query_upper = masked_query.upper()

        if not any(query_upper.startswith(prefix) for prefix in READ_ONLY_PREFIXES):
            return (
                False,
                "Error: Only SELECT, SHOW, DESCRIBE, DESC, and EXPLAIN queries "
                "are allowed for safety.",
            )

        for keyword in DISALLOWED_SQL_KEYWORDS:
            if re.search(rf"\b{keyword}\b", query_upper):
                return (
                    False,
                    "Error: Mutating or administrative SQL statements are not allowed.",
                )

        if query_upper.startswith("SHOW TABLES"):
            return True, ""

        describe_match = re.match(
            r"""(?ix)
            \s*des(?:cribe|c)\s+(?:table\s+)?
            (
                (?:
                    [`"]?[a-zA-Z_][\w]*[`"]?\.
                )?
                [`"]?[a-zA-Z_][\w]*[`"]?
            )
            """,
            stripped_query,
        )
        if describe_match:
            if not self.is_allowed_table(describe_match.group(1)):
                return (
                    False,
                    f"Error: Only schema access for {self.resolved_table_name} is allowed.",
                )
            return True, ""

        referenced_tables = self.extract_referenced_tables(stripped_query)
        if not referenced_tables:
            return (
                False,
                f"Error: Queries must read from {self.resolved_table_name} only.",
            )

        disallowed_tables = sorted(
            table_name
            for table_name in referenced_tables
            if not self.is_allowed_table(table_name)
        )
        if disallowed_tables:
            return (
                False,
                f"Error: Only {self.resolved_table_name} is allowed. "
                f"Blocked references: {', '.join(disallowed_tables)}.",
            )

        return True, ""

    def validate_dashboard(self, sql_query: str) -> tuple[bool, str]:
        """Stricter than validate_read_only: saved cards may only SELECT."""
        stripped_query = sql_query.strip()
        masked_query = mask_literals(stripped_query)
        normalized_masked = (
            masked_query[:-1].strip()
            if masked_query.rstrip().endswith(";")
            else masked_query
        )
        normalized_query = (
            stripped_query[:-1].strip()
            if stripped_query.endswith(";")
            else stripped_query
        )
        query_upper = normalized_masked.upper()

        if ";" in normalized_masked:
            return False, "Only a single SQL statement is allowed."

        if not query_upper.startswith("SELECT"):
            return False, "Saved dashboard cards may only rerun SELECT queries."

        if re.search(r"(?is)\bFORMAT\s+\w+\b", normalized_masked):
            return False, "FORMAT clauses are not allowed in saved dashboard queries."

        if re.search(r"(?is)\bINTO\s+OUTFILE\b", normalized_masked):
            return False, "Export clauses are not allowed in saved dashboard queries."

        return self.validate_read_only(normalized_query)
