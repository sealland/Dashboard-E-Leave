"""
Explore SQL Server schema and sample data for dashboard planning.

Usage:
    python scripts/explore_db.py
    python scripts/explore_db.py --table ApprovalRequest
    python scripts/explore_db.py --schema dbo --limit 5
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db.connection import describe_table, execute_query, list_tables, sample_table


def test_connection() -> None:
    result = execute_query("SELECT @@VERSION AS sql_version, DB_NAME() AS database_name, GETDATE() AS server_time")
    print("=== Connection OK ===")
    print(result.to_string(index=False))
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Explore HR_Approve SQL Server database")
    parser.add_argument("--schema", default="dbo", help="Schema name (default: dbo)")
    parser.add_argument("--table", help="Inspect a specific table (columns + sample rows)")
    parser.add_argument("--limit", type=int, default=10, help="Sample row limit (default: 10)")
    args = parser.parse_args()

    try:
        test_connection()

        if args.table:
            print(f"=== Columns: [{args.schema}].[{args.table}] ===")
            print(describe_table(args.table, args.schema).to_string(index=False))
            print()
            print(f"=== Sample rows (TOP {args.limit}) ===")
            print(sample_table(args.table, args.schema, args.limit).to_string(index=False))
            return

        print(f"=== Tables in schema '{args.schema}' ===")
        tables = list_tables(args.schema)
        if tables.empty:
            print("No tables found.")
            return
        print(tables.to_string(index=False))
        print()
        print("Tip: python scripts/explore_db.py --table <TableName>")

    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        print("\nCheck .env settings (copy from .env.example) and ODBC driver installation.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
