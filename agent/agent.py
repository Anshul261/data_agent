import os

from dotenv import load_dotenv

load_dotenv()

import clickhouse_connect
from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.models.azure import AzureOpenAI
from agno.os import AgentOS
from agno.tools import tool
from agno.tools.reasoning import ReasoningTools
from agno.db.sqlite import SqliteDb

print("Connecting to SQLite Memory...")

db = SqliteDb(db_file=os.getenv('AGENT_DB_FILE', './tmp/data.db'))

print("Connected to PostgreSQL Agent KB")

db_knowledge_base_postgres_url = os.getenv("POSTGRES_URL")
db_knowledge_base_postgres = PostgresDb(db_url=db_knowledge_base_postgres_url)


print("Connected to PostgreSQL Knowledge Base")

# Connect to ClickHouse
print("Connecting to ClickHouse...")
clickhouse_client = clickhouse_connect.get_client(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
    username=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DATABASE", "default"),
)
print(f"Connected to {os.getenv('CLICKHOUSE_HOST')}")


# Define tools for the agent
@tool
def execute_clickhouse_query(sql_query: str) -> str:
    """
    Execute a SQL query against the ClickHouse database.
    Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed.

    Args:
        sql_query: The SQL query to execute (must be a read-only query)

    Returns:
        The query results formatted as a table string
    """
    try:
        # Security check - only allow read operations
        query_upper = sql_query.strip().upper()
        if not any(
            query_upper.startswith(cmd)
            for cmd in ["SELECT", "SHOW", "DESCRIBE", "EXPLAIN"]
        ):
            return "Error: Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed for safety."

        # Execute the query
        result = clickhouse_client.query(sql_query)

        if not result.result_rows:
            return "Query executed successfully but returned no results."

        # Format as table
        columns = result.column_names
        rows = result.result_rows

        # Calculate column widths
        col_widths = [len(str(col)) for col in columns]
        for row in rows[:50]:
            for i, val in enumerate(row):
                col_widths[i] = max(col_widths[i], len(str(val)))

        # Build table
        lines = []

        # Header
        header = " | ".join(
            str(col).ljust(col_widths[i]) for i, col in enumerate(columns)
        )
        separator = "-+-".join("-" * w for w in col_widths)
        lines.append(header)
        lines.append(separator)

        # Rows (limit to 50 for readability)
        for row in rows[:50]:
            lines.append(
                " | ".join(str(val).ljust(col_widths[i]) for i, val in enumerate(row))
            )

        if len(rows) > 50:
            lines.append(f"\n... ({len(rows) - 50} more rows not shown)")

        lines.append(f"\nTotal rows returned: {len(rows)}")

        return "\n".join(lines)

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
        result = clickhouse_client.query("SHOW TABLES")
        tables = [row[0] for row in result.result_rows]

        if not tables:
            return "No tables found in the database."

        return "Available tables:\n" + "\n".join(f"  • {table}" for table in tables)
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
        result = clickhouse_client.query(f"DESCRIBE TABLE {table_name}")

        lines = [
            f"Schema for table: {table_name}",
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
    api_key=os.getenv("AZURE_OPENAI_API_KEY_5"),
    api_version=os.getenv("2025-04-01-preview", "2024-02-15-preview"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT_5"),
    azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME_5"),
)

# Create the analytics agent
ticket_agent = Agent(
    name="Ticket Analytics Agent",
    model=llm,
    db=db,
    tools=[
        execute_clickhouse_query,
        list_all_tables,
        get_table_schema,
        ReasoningTools(add_instructions=True),
    ],
    instructions=[
        "You are a ticket analytics expert with direct database access.",
        "When users ask questions:",
        "1. ALWAYS start by using list_all_tables() to see what data is available",
        "2. Use get_table_schema(table_name) to understand the table structure",
        "3. Use execute_clickhouse_query(sql) to run queries and get actual data",
        "4. NEVER just describe what query you would run - ACTUALLY EXECUTE IT",
        "5. Present the results clearly with insights and recommendations",
        "Important: You MUST call the tools to get real data. Do not make up or assume data.",
        "Always execute queries and show the actual results to the user.",
        "Ensure to follow user format like Table then the data as a markdown table."
        "No need to explain approach or reasoning, just provide the answer to the user's question unless user asks for it."
        "Always use the tools to get the data and show the results to the user."
    ],
    enable_agentic_memory= True,
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
)
app = agent_os.get_app()


if __name__ == "__main__":
    agent_os.serve(app="agent:app", port=7777)
