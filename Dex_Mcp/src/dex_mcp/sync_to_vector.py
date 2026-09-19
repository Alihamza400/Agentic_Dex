"""
Mirrors pair_snapshots from MySQL into the Qdrant vector store so the agents can
recall similar historical market situations.

Usage: uv run dex-vectors   (or: uv run python -m dex_mcp.sync_to_vector)
"""

from __future__ import annotations

import asyncio

import aiomysql

from dex_mcp.config import DB_CONFIG
from dex_mcp.Vector_Store import vector_store


async def sync_mysql_to_qdrant(limit: int | None = None) -> int:
    conn = await aiomysql.connect(**DB_CONFIG)
    synced = 0

    try:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            sql = "SELECT * FROM pair_snapshots ORDER BY blockNumber DESC"
            if limit:
                sql += f" LIMIT {int(limit)}"
            try:
                await cur.execute(sql)
                snapshots = await cur.fetchall()
            except Exception as exc:
                print(f"Cannot read pair_snapshots: {exc}")
                print("Run `npm run db:init` and `npm run index` first.")
                return 0

            total = len(snapshots)
            print(f"Found {total} snapshots to sync.")

            for index, snapshot in enumerate(snapshots, start=1):
                print(f"[{index}/{total}] snapshot {snapshot['id']} (block {snapshot['blockNumber']})")
                try:
                    if await asyncio.to_thread(vector_store.upsert_snapshot, snapshot):
                        synced += 1
                except Exception as exc:
                    print(f"  skipped: {exc}")
    finally:
        conn.close()

    print(f"Synced {synced}/{total if 'total' in locals() else 0} snapshots into Qdrant.")
    return synced


def main() -> None:
    asyncio.run(sync_mysql_to_qdrant())


if __name__ == "__main__":
    main()
