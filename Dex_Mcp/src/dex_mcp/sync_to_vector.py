import asyncio
import os
import aiomysql
from dotenv import load_dotenv
from dex_mcp.Vector_Store import vector_store

load_dotenv()

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "user":     os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "db":       os.getenv("DB_NAME"),
}

async def sync_mysql_to_qdrant():
    print("Starting MySQL to Qdrant synchronization...")
    
    conn = await aiomysql.connect(**DB_CONFIG)
    async with conn.cursor(aiomysql.DictCursor) as cur:
        # Fetch all snapshots
        await cur.execute("SELECT * FROM pair_snapshots")
        snapshots = await cur.fetchall()
        
        print(f"Found {len(snapshots)} snapshots to sync.")
        
        for i, snapshot in enumerate(snapshots):
            print(f"[{i+1}/{len(snapshots)}] Syncing snapshot {snapshot['id']} (Block {snapshot['blockNumber']})...")
            await vector_store.upsert_snapshot(snapshot)
            
    conn.close()
    print("Synchronization complete!")

if __name__ == "__main__":
    asyncio.run(sync_mysql_to_qdrant())
