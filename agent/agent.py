import os
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Optional

from dotenv import load_dotenv

load_dotenv()

import auth as auth_utils
import dashboard_store
import clickhouse_connect
import jwt
from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.knowledge import Knowledge
from agno.knowledge.embedder.huggingface import HuggingfaceCustomEmbedder
from agno.models.azure import AzureOpenAI
from agno.os import AgentOS
from agno.os.middleware.jwt import JWTMiddleware
from agno.tools import tool
from agno.tools.reasoning import ReasoningTools
from agno.vectordb.pgvector import PgVector
from agno.vectordb.search import SearchType
from fastapi import HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from tools.viz import VisualizationTools


def env_flag(name: str, default: bool = False) -> bool:
    """Parse a boolean environment variable with common truthy values."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


# JWT configuration - read from env, warn if missing
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET environment variable is required. "
        'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
    )

postgres_url = os.getenv("AZURE_POSTGRES_URL")
if not postgres_url:
    raise RuntimeError("AZURE_POSTGRES_URL environment variable is required.")

# Single Azure PostgreSQL — sessions, knowledge base, vector store, charts, users
print("Connecting to Azure PostgreSQL...")
db = PostgresDb(db_url=postgres_url)
print("Connected to Azure PostgreSQL (agent sessions)")

# Ensure users table exists
auth_utils.ensure_users_table(postgres_url)
dashboard_store.ensure_dashboard_tables(postgres_url)

# Knowledge Base mode:
# - ENABLE_KNOWLEDGE_BASE=true  -> curated mode (uses pgvector knowledge)
# - ENABLE_KNOWLEDGE_BASE=false -> plug-and-play mode (no knowledge dependency)
enable_knowledge_base = env_flag("ENABLE_KNOWLEDGE_BASE", default=True)
ticket_knowledge = None
knowledge_vector_db = None

if enable_knowledge_base:
    print("Setting up Knowledge Base...")
    hf_api_key = os.getenv("HUGGINGFACE_API_KEY") or os.getenv("HUGGINGFACE_HUB_TOKEN")
    if not hf_api_key:
        raise RuntimeError(
            "Knowledge base embedding requires HUGGINGFACE_HUB_TOKEN or HUGGINGFACE_API_KEY."
        )
    embedder = HuggingfaceCustomEmbedder(
        id=os.getenv("HUGGINGFACE_EMBEDDING_MODEL", "google/embeddinggemma-300m"),
        api_key=hf_api_key,
        dimensions=int(os.getenv("EMBEDDING_DIMENSIONS", "768")),
    )

    knowledge_vector_db = PgVector(
        table_name="ticket_analytics_kb",
        db_url=postgres_url,
        embedder=embedder,
        search_type=SearchType.vector,
    )

    ticket_knowledge = Knowledge(
        name="ticket_analytics_knowledge",
        description="Table schemas, validated queries, and business rules for ticket analytics",
        vector_db=knowledge_vector_db,
        contents_db=PostgresDb(db_url=postgres_url),
        max_results=5,
    )
    print("Knowledge Base configured")
else:
    print("Knowledge Base disabled (plug-and-play mode)")

# Connect to ClickHouse
print("Connecting to ClickHouse...")
clickhouse_client = clickhouse_connect.get_client(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
    username=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DATABASE", "default"),
)
print(f"Connected to ClickHouse at {os.getenv('CLICKHOUSE_HOST')}")

# Visualization tools setup
print("Setting up Visualization Tools...")
chart_base_url = os.getenv("CHART_BASE_URL", "http://localhost:7777")
viz_tools = VisualizationTools(
    db_url=postgres_url,
    base_url=chart_base_url,
)
print("Visualization Tools configured")


ALLOWED_TABLE_NAME = os.getenv("CLICKHOUSE_ALLOWED_TABLE", "LLM_access_tickets")
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


def _normalize_identifier(identifier: str) -> str:
    return identifier.replace("`", "").replace('"', "").strip().lower()


def _resolve_allowed_table() -> tuple[str, str]:
    configured_database = os.getenv("CLICKHOUSE_DATABASE", "default")
    escaped_name = ALLOWED_TABLE_NAME.replace("'", "''")
    escaped_db = configured_database.replace("'", "''")
    result = clickhouse_client.query(
        f"""
        SELECT database, name
        FROM system.tables
        WHERE lower(name) = lower('{escaped_name}')
        ORDER BY database = '{escaped_db}' DESC, database = 'default' DESC, database
        LIMIT 1
        """
    )
    if not result.result_rows:
        raise RuntimeError(
            f"Required ClickHouse table/view '{ALLOWED_TABLE_NAME}' was not found in system.tables."
        )
    database, table_name = result.result_rows[0]
    return str(database), str(table_name)


ALLOWED_TABLE_DATABASE, RESOLVED_ALLOWED_TABLE_NAME = _resolve_allowed_table()
ALLOWED_TABLE_FQN = f"{ALLOWED_TABLE_DATABASE}.{RESOLVED_ALLOWED_TABLE_NAME}"
ALLOWED_TABLE_IDENTIFIERS = {
    _normalize_identifier(ALLOWED_TABLE_NAME),
    _normalize_identifier(RESOLVED_ALLOWED_TABLE_NAME),
    _normalize_identifier(ALLOWED_TABLE_FQN),
}


def _rewrite_allowed_table_references(sql_query: str) -> str:
    pattern = re.compile(
        rf"""(?ix)
        (?<![\w.])
        {re.escape(ALLOWED_TABLE_NAME)}
        (?![\w])
        """
    )
    return pattern.sub(ALLOWED_TABLE_FQN, sql_query)


def _extract_referenced_tables(sql_query: str) -> set[str]:
    return {
        _normalize_identifier(match.group(1))
        for match in TABLE_REFERENCE_PATTERN.finditer(sql_query)
    }


def _is_allowed_table(identifier: str) -> bool:
    return _normalize_identifier(identifier) in ALLOWED_TABLE_IDENTIFIERS


def _validate_read_only_query(sql_query: str) -> tuple[bool, str]:
    stripped_query = sql_query.strip()
    query_upper = stripped_query.upper()

    if not any(query_upper.startswith(prefix) for prefix in READ_ONLY_PREFIXES):
        return (
            False,
            "Error: Only SELECT, SHOW, DESCRIBE, DESC, and EXPLAIN queries are allowed for safety.",
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
        if not _is_allowed_table(describe_match.group(1)):
            return (
                False,
                f"Error: Only schema access for {RESOLVED_ALLOWED_TABLE_NAME} is allowed.",
            )
        return True, ""

    referenced_tables = _extract_referenced_tables(stripped_query)
    if not referenced_tables:
        return (
            False,
            f"Error: Queries must read from {RESOLVED_ALLOWED_TABLE_NAME} only.",
        )

    disallowed_tables = sorted(
        table_name for table_name in referenced_tables if not _is_allowed_table(table_name)
    )
    if disallowed_tables:
        return (
            False,
            f"Error: Only {RESOLVED_ALLOWED_TABLE_NAME} is allowed. Blocked references: {', '.join(disallowed_tables)}.",
        )

    return True, ""


def _validate_dashboard_query(sql_query: str) -> tuple[bool, str]:
    stripped_query = sql_query.strip()
    normalized_query = stripped_query[:-1].strip() if stripped_query.endswith(";") else stripped_query
    query_upper = normalized_query.upper()

    if ";" in normalized_query:
        return False, "Only a single SQL statement is allowed."

    if not query_upper.startswith("SELECT"):
        return False, "Saved dashboard cards may only rerun SELECT queries."

    if re.search(r"(?is)\bFORMAT\s+\w+\b", normalized_query):
        return False, "FORMAT clauses are not allowed in saved dashboard queries."

    if re.search(r"(?is)\bINTO\s+OUTFILE\b", normalized_query):
        return False, "Export clauses are not allowed in saved dashboard queries."

    is_valid, error_message = _validate_read_only_query(normalized_query)
    if not is_valid:
        return False, error_message

    return True, ""


def _clickhouse_rows_as_dicts(sql_query: str) -> list[dict]:
    result = clickhouse_client.query(
        _rewrite_allowed_table_references(sql_query),
        settings={
            "max_execution_time": 30,
            "max_result_rows": 5000,
            "result_overflow_mode": "break",
        },
    )
    columns = [str(column) for column in result.column_names]
    return [
        {columns[index]: value for index, value in enumerate(row)}
        for row in result.result_rows
    ]


def _get_authenticated_user_id(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")

    return str(user_id)


def _format_clickhouse_result(result) -> str:
    if not result.result_rows:
        return "Query executed successfully but returned no results."

    columns = result.column_names
    rows = result.result_rows
    col_widths = [len(str(col)) for col in columns]
    for row in rows[:50]:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))

    lines = []
    header = " | ".join(str(col).ljust(col_widths[i]) for i, col in enumerate(columns))
    separator = "-+-".join("-" * w for w in col_widths)
    lines.append(header)
    lines.append(separator)

    for row in rows[:50]:
        lines.append(
            " | ".join(str(val).ljust(col_widths[i]) for i, val in enumerate(row))
        )

    if len(rows) > 50:
        lines.append(f"\n... ({len(rows) - 50} more rows not shown)")

    lines.append(f"\nTotal rows returned: {len(rows)}")
    return "\n".join(lines)

# Define tools for the agent
@tool
def execute_clickhouse_query(sql_query: str) -> str:
    """
    Execute a SQL query against the ClickHouse database.
    Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed.
    Only LLM_access_tickets table is allowed for data queries.

    Args:
        sql_query: The SQL query to execute (must be a read-only query)

    Returns:
        The query results formatted as a table string
    """
    try:
        is_valid, error_message = _validate_read_only_query(sql_query)
        if not is_valid:
            return error_message

        query_upper = sql_query.strip().upper()
        if query_upper.startswith("SHOW TABLES"):
            return list_all_tables.entrypoint()

        if re.match(r"(?is)^\s*des(?:cribe|c)\b", sql_query.strip()):
            table_name = sql_query.strip().split()[-1]
            return get_table_schema.entrypoint(table_name)

        result = clickhouse_client.query(_rewrite_allowed_table_references(sql_query))
        return _format_clickhouse_result(result)

    except Exception as e:
        return f"Error executing query: {str(e)}"


@tool
def list_all_tables() -> str:
    """
    List all tables available in the current ClickHouse database.
    Use this to discover what data is available.

    Returns:
        A list of all table names in the database
    """
    try:
        return "Available tables:\n" + "\n".join(
            [
                f"  • {RESOLVED_ALLOWED_TABLE_NAME}",
                f"    database: {ALLOWED_TABLE_DATABASE}",
            ]
        )
    except Exception as e:
        return f"Error listing tables: {str(e)}"


@tool
def get_table_schema(table_name: str) -> str:
    """
    Get the complete schema/structure of a specific table.
    Shows all columns with their data types and default values.

    Args:
        table_name: The name of the table to describe

    Returns:
        The table schema with column details
    """
    try:
        if not _is_allowed_table(table_name):
            return (
                f"Error: Schema access is restricted to {RESOLVED_ALLOWED_TABLE_NAME} only."
            )

        result = clickhouse_client.query(f"DESCRIBE TABLE {ALLOWED_TABLE_FQN}")

        lines = [
            f"Schema for table: {RESOLVED_ALLOWED_TABLE_NAME}",
            "=" * 90,
            f"{'Column Name':<35} {'Type':<30} {'Default':<20}",
            "-" * 90,
        ]

        for row in result.result_rows:
            col_name = str(row[0])
            col_type = str(row[1])
            col_default = str(row[2]) if len(row) > 2 and row[2] else ""
            lines.append(f"{col_name:<35} {col_type:<30} {col_default:<20}")

        return "\n".join(lines)
    except Exception as e:
        return f"Error describing table '{table_name}': {str(e)}"


# LLM Initialization
llm = AzureOpenAI(
    id=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME_5", "gpt-4.1-mini"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("2025-04-01-preview", "2024-02-15-preview"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT_5"),
    azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME_5"),
)

base_instructions = [
    "You are a ticket analytics expert with direct database access.",
    f"Your ClickHouse access is strictly limited to the {RESOLVED_ALLOWED_TABLE_NAME} view in database {ALLOWED_TABLE_DATABASE}.",
    "When users ask questions:",
    "1. Use get_table_schema(table_name) to understand table structure when needed",
    "2. Use execute_clickhouse_query(sql) to run queries and get actual data",
    "3. NEVER just describe what query you would run - ACTUALLY EXECUTE IT",
    "4. Present the results clearly with insights and recommendations",
    "Important: You MUST call the tools to get real data. Do not make up or assume data.",
    "Always execute queries and show the actual results to the user.",
    "Ensure to follow user format like Table then the data as a markdown table.",
    "No need to explain approach or reasoning, just provide the answer to the user's question unless user asks for it.",
    "Always use the tools to get the data and show the results to the user.",
]

knowledge_instructions = [
    "You have a knowledge base containing table schemas, validated SQL queries, and business rules.",
    "1. FIRST search the knowledge base for relevant table schemas, validated queries, or business rules",
    "2. Use validated queries from the knowledge base when available instead of writing new ones",
    "3. If no matching query exists, use get_table_schema(table_name) to understand table structure",
]

chart_instructions = [
    "When the user asks for a chart, visualization, or graph:",
    "1. First query the data from ClickHouse using execute_clickhouse_query",
    "2. Prefer create_chart_artifact with the query results, chart type, title, field mappings, SQL, and a short insight so the UI can render a professional interactive dashboard card",
    "3. Include the returned ```chart-artifact``` block exactly in your response. Do not rewrite or summarize the JSON inside that block",
    "4. Use the PNG chart tools only as a fallback when an image is explicitly requested or the artifact tool is not suitable. If using a PNG chart tool, include it with markdown image syntax: ![Chart Title](chart_url)",
    "5. Provide a brief interpretation of the chart alongside it",
    "Choose chart types wisely: bar charts for categories, line charts for trends over time, pie charts for proportions, scatter plots for correlations, histograms for distributions.",
    "When the user asks to modify or update a previous chart (e.g. 'make it a pie chart', 'show only last 6 months', 'sort by count', 'add more categories'):",
    "1. Check the conversation history for the data that was already queried",
    "2. If the same data can be reused with a different chart type or parameters, call create_chart_artifact directly with that data — do NOT re-query ClickHouse",
    "3. If the modification requires different or filtered data (e.g. different time range, different grouping), run a new query first",
    "4. Always embed the updated chart with ![Chart Title](chart_url) and briefly note what changed",
]

agent_instructions = [*base_instructions]
if enable_knowledge_base:
    agent_instructions = [
        agent_instructions[0],
        *knowledge_instructions,
        *agent_instructions[1:],
    ]
agent_instructions.extend(chart_instructions)

# Create the analytics agent
ticket_agent = Agent(
    name="Ticket Analytics Agent",
    model=llm,
    db=db,
    knowledge=ticket_knowledge if enable_knowledge_base else None,
    search_knowledge=enable_knowledge_base,
    add_knowledge_to_context=False,
    tools=[
        execute_clickhouse_query,
        list_all_tables,
        get_table_schema,
        viz_tools,
        ReasoningTools(add_instructions=True),
    ],
    instructions=agent_instructions,
    enable_agentic_memory=True,
    enable_agentic_state=True,
    add_history_to_context=True,
    num_history_runs=10,
    add_session_state_to_context=True,
    markdown=True,
    debug_mode=True,
)


def main():
    print("=" * 60)
    print("Ticket Analytics Agent - Interactive Terminal")
    print("=" * 60)
    print(f"\nConnected to ClickHouse at {os.getenv('CLICKHOUSE_HOST')}")
    print(f"  Database: {os.getenv('CLICKHOUSE_DATABASE')}")
    print(f"  Allowed view: {ALLOWED_TABLE_FQN}")
    print("\nTips:")
    print("  - Ask: 'What tables are available?'")
    print("  - Ask: 'Show me the schema of [table_name]'")
    print("  - Ask: 'What is the ticket volume this month?'")
    print("\nType 'exit' or 'quit' to end the session.\n")

    while True:
        try:
            user_query = input("\nYou: ").strip()

            if user_query.lower() in ["exit", "quit", "q"]:
                print("\nGoodbye!")
                break

            if not user_query:
                continue

            print("\nAgent:")
            ticket_agent.print_response(user_query, stream=True)

        except KeyboardInterrupt:
            print("\n\nSession interrupted. Goodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}")
            import traceback

            print(f"\nError: {e}")
            import traceback

            traceback.print_exc()

            print("\nPlease try again or type 'exit' to quit.")


agent_os = AgentOS(
    id="agentos-demo",
    agents=[ticket_agent],
    knowledge=[ticket_knowledge] if enable_knowledge_base and ticket_knowledge else [],
)
app = agent_os.get_app()

# Agno's get_app() adds its own CORSMiddleware internally.
# Having two CORS middlewares can produce conflicting headers and confuse
# the browser's preflight check.  Remove it before building our stack.
app.user_middleware = [m for m in app.user_middleware if m.cls is not CORSMiddleware]
app.middleware_stack = None  # force rebuild on next request

# Middleware stack is LIFO: last added = outermost = runs first.
#
# Final request order:  CORSMiddleware → JWTMiddleware → route handler
#
# CORSMiddleware (outermost) responds to OPTIONS preflight requests
# with the correct Allow-Origin headers before JWT ever sees them.
# JWTMiddleware then validates the token on every non-OPTIONS request.
app.add_middleware(
    JWTMiddleware,
    secret_key=JWT_SECRET,
    algorithm=JWT_ALGORITHM,
    excluded_route_paths=[
        "/health",
        "/docs",
        "/docs/*",
        "/docs/oauth2-redirect",
        "/redoc",
        "/openapi.json",
        "/api/charts/*",
        "/auth/login",
        "/auth/bootstrap",
        "/auth/recover",
    ],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(
    "Middleware stack (outermost → innermost):",
    [m.cls.__name__ for m in reversed(app.user_middleware)],
)


def generate_token(
    sub: str = "user", scopes: list[str] | None = None, hours: int = 24
) -> str:
    """Generate a signed JWT token for testing / bootstrapping."""
    payload = {
        "sub": sub,
        "scopes": scopes
        or ["agents:read", "agents:run", "sessions:read", "sessions:write"],
        "iat": datetime.now(UTC) - timedelta(seconds=30),
        "exp": datetime.now(UTC) + timedelta(hours=hours),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


class LoginRequest(BaseModel):
    username: str
    password: str


class BootstrapRequest(BaseModel):
    username: str
    password: str


class PasswordRecoveryRequest(BaseModel):
    username: str
    new_password: str
    recovery_key: str


class DashboardCardRequest(BaseModel):
    title: str
    chart_type: Literal["metric", "line", "bar", "pie", "table"]
    sql: str
    mapping: dict[str, Any] = Field(default_factory=dict)
    presentation: dict[str, Any] = Field(default_factory=dict)
    insight: Optional[str] = None
    last_result: list[dict[str, Any]] = Field(default_factory=list)
    position: dict[str, Any] = Field(default_factory=dict)


class CreateDashboardRequest(BaseModel):
    name: str
    description: Optional[str] = None
    source_session_id: Optional[str] = None
    layout: list[dict[str, Any]] = Field(default_factory=list)
    cards: list[DashboardCardRequest]


@app.post("/auth/login")
async def login(req: LoginRequest):
    """Authenticate a user and return a JWT."""
    user = auth_utils.get_user(req.username, postgres_url)
    if not user or not auth_utils.verify_password(
        req.password, user["hashed_password"]
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    scopes = (
        ["agent_os:admin"]
        if user["role"] == "admin"
        else ["agents:run", "sessions:read", "sessions:write"]
    )
    token = generate_token(sub=user["id"], scopes=scopes, hours=8)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "role": user["role"],
    }


@app.post("/auth/bootstrap")
async def bootstrap_admin(req: BootstrapRequest):
    """Seed the first admin user. Only works when no admin exists yet."""
    if auth_utils.admin_exists(postgres_url):
        raise HTTPException(status_code=409, detail="An admin user already exists")
    user = auth_utils.create_user(req.username, req.password, "admin", postgres_url)
    return {"message": "Admin user created", "username": user["username"]}


@app.post("/auth/recover")
async def recover_password(req: PasswordRecoveryRequest):
    """
    Reset a user's password using a server-side recovery key.
    Set AUTH_RECOVERY_KEY in the backend environment to enable this endpoint.
    Admin accounts are intentionally excluded from recovery.
    """
    configured_key = os.getenv("AUTH_RECOVERY_KEY")
    # Backward-compatible fallback for common typo in env var name.
    if not configured_key:
        configured_key = os.getenv("AUTH_RECOOVERY_KEY")
    if not configured_key:
        raise HTTPException(
            status_code=503,
            detail="Recovery is disabled. Set AUTH_RECOVERY_KEY on the backend.",
        )

    provided_key = req.recovery_key.strip()
    expected_key = configured_key.strip()

    if not secrets.compare_digest(provided_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid recovery key")

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long",
        )

    user = auth_utils.get_user(req.username, postgres_url)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user["role"] == "admin":
        raise HTTPException(
            status_code=403,
            detail="Password recovery is disabled for admin accounts.",
        )

    updated = auth_utils.update_user_password(req.username, req.new_password, postgres_url)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password")

    return {"message": "Password reset successful", "username": req.username}


@app.post("/api/dashboards")
async def create_saved_dashboard(req: CreateDashboardRequest, request: Request):
    user_id = _get_authenticated_user_id(request)

    if not req.cards:
        raise HTTPException(status_code=400, detail="Dashboard must include at least one card.")

    cards: list[dict[str, Any]] = []
    for index, card in enumerate(req.cards):
        sql_query = card.sql.strip()
        is_valid, error_message = _validate_dashboard_query(sql_query)
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Card '{card.title}' has unsafe SQL: {error_message}",
            )

        cards.append(
            {
                "title": card.title.strip() or f"Card {index + 1}",
                "chart_type": card.chart_type,
                "sql": sql_query,
                "mapping": card.mapping,
                "presentation": card.presentation,
                "insight": card.insight,
                "last_result": card.last_result,
                "position": card.position or {"order": index},
            }
        )

    return dashboard_store.create_dashboard(
        postgres_url,
        owner_user_id=user_id,
        name=req.name.strip() or "Untitled dashboard",
        description=req.description,
        source_session_id=req.source_session_id,
        layout=req.layout,
        cards=cards,
    )


@app.get("/api/dashboards")
async def list_saved_dashboards(request: Request):
    user_id = _get_authenticated_user_id(request)
    return {"data": dashboard_store.list_dashboards(postgres_url, owner_user_id=user_id)}


@app.get("/api/dashboards/{dashboard_id}")
async def get_saved_dashboard(dashboard_id: str, request: Request):
    user_id = _get_authenticated_user_id(request)
    dashboard = dashboard_store.get_dashboard(
        postgres_url, dashboard_id=dashboard_id, owner_user_id=user_id
    )
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@app.post("/api/dashboards/{dashboard_id}/refresh")
async def refresh_saved_dashboard(dashboard_id: str, request: Request):
    user_id = _get_authenticated_user_id(request)
    dashboard = dashboard_store.get_dashboard(
        postgres_url, dashboard_id=dashboard_id, owner_user_id=user_id
    )
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    for card in dashboard["cards"]:
        sql_query = str(card["sql"]).strip()
        is_valid, error_message = _validate_dashboard_query(sql_query)

        if not is_valid:
            dashboard_store.update_card_result(
                postgres_url,
                dashboard_id=dashboard_id,
                card_id=card["id"],
                last_result=card.get("last_result") or [],
                last_error=error_message,
            )
            continue

        try:
            rows = _clickhouse_rows_as_dicts(sql_query)
            dashboard_store.update_card_result(
                postgres_url,
                dashboard_id=dashboard_id,
                card_id=card["id"],
                last_result=rows,
                last_error=None,
            )
        except Exception as exc:
            dashboard_store.update_card_result(
                postgres_url,
                dashboard_id=dashboard_id,
                card_id=card["id"],
                last_result=card.get("last_result") or [],
                last_error=str(exc),
            )

    refreshed = dashboard_store.get_dashboard(
        postgres_url, dashboard_id=dashboard_id, owner_user_id=user_id
    )
    return refreshed


@app.get("/api/charts/{chart_id}")
async def serve_chart(chart_id: str):
    """Serve a chart image from SQLite by its UUID."""
    image_data = viz_tools.get_chart_bytes(chart_id)
    if image_data is None:
        raise HTTPException(status_code=404, detail="Chart not found")
    return Response(
        content=image_data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.delete("/api/knowledge")
async def delete_knowledge():
    """Clear all documents from the knowledge base vector store."""
    if not enable_knowledge_base or knowledge_vector_db is None:
        raise HTTPException(
            status_code=400,
            detail="Knowledge base is disabled. Set ENABLE_KNOWLEDGE_BASE=true to use this endpoint.",
        )
    try:
        knowledge_vector_db.drop()
        knowledge_vector_db.create()
        return {"status": "success", "message": "Knowledge base cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/knowledge/load")
async def load_knowledge():
    """
    Load the trimmed knowledge set into the vector database.
    Raw SQL files are intentionally excluded from embedding retrieval. The validated
    query catalog is embedded instead, while the .sql files remain the source of truth
    in the repository.
    """
    if not enable_knowledge_base or ticket_knowledge is None:
        raise HTTPException(
            status_code=400,
            detail="Knowledge base is disabled. Set ENABLE_KNOWLEDGE_BASE=true to use this endpoint.",
        )
    from pathlib import Path

    knowledge_dir = Path(__file__).parent / "knowledge"
    files = [
        knowledge_dir / "tables" / "LLM_access_tickets.json",
        *sorted(knowledge_dir.glob("business/*.json")),
    ]

    loaded, errors = 0, []

    for f in files:
        try:
            await ticket_knowledge.add_content_async(
                path=str(f),
                name=f.stem,
                upsert=True,
                skip_if_exists=True,
            )
            loaded += 1
        except Exception as e:
            errors.append({"file": f.name, "error": str(e)})

    return {
        "loaded": loaded,
        "errors": errors,
        "total": len(files),
        "skipped": len(files) - loaded - len(errors),
    }


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("Ticket Analytics Agent")
    print("=" * 60)
    print(f"\nJWT Algorithm : {JWT_ALGORITHM}")
    print(f"Knowledge Base Mode: {'enabled' if enable_knowledge_base else 'disabled'}")
    print("\nFirst-time setup: POST /auth/bootstrap to create the admin user")
    print("Then log in at http://localhost:3000/login")
    print("=" * 60 + "\n")
    agent_os.serve(app="agent:app", port=7777)
