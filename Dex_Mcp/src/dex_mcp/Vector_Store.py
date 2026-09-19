"""
Vector_Store.py -- Qdrant-backed memory of historical market snapshots.

The store is initialised lazily and degrades gracefully: if the API key or Qdrant are
unavailable the search tools simply return an empty list instead of breaking the agent loop.
"""

from __future__ import annotations

import hashlib
import os
import sys

from dotenv import load_dotenv

from dex_mcp.config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL

load_dotenv()

# Use a small local embedding approach since OpenRouter may not support embeddings.
# We generate a deterministic pseudo-embedding from the text hash for Qdrant storage.
EMBEDDING_SIZE = 384


class VectorStore:
    def __init__(self, collection_name: str = "dex_market_history"):
        self.collection_name = collection_name
        self.vector_size = EMBEDDING_SIZE
        self._client = None
        self._ready = False
        self._failure: str | None = None

    # ── lazy initialisation ───────────────────────────────────────────────
    def _ensure_ready(self) -> bool:
        if self._ready:
            return True
        if self._failure:
            return False

        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams

            db_path = os.path.join(os.path.dirname(__file__), "qdrant_db")
            self._client = QdrantClient(path=db_path)

            try:
                info = self._client.get_collection(self.collection_name)
                if info.config.params.vectors.size != self.vector_size:
                    self._client.delete_collection(self.collection_name)
                    raise ValueError("recreate")
            except Exception:
                self._client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
                )

            self._ready = True
            return True
        except Exception as exc:  # noqa: BLE001 - vector memory is optional
            self._failure = str(exc)
            print(f"[vector-store] disabled: {exc}", file=sys.stderr)
            return False

    def _embed(self, text: str) -> list[float]:
        """Generate a deterministic pseudo-embedding from text.
        Uses a hash-based approach for consistent vectors."""
        # Create a deterministic vector from the text content
        h = hashlib.sha512(text.encode("utf-8")).digest()
        # Expand to desired size by repeating and truncating
        raw = (h * (self.vector_size // len(h) + 1))[:self.vector_size]
        # Normalize to [0, 1] range
        return [b / 255.0 for b in raw]

    # ── public API ────────────────────────────────────────────────────────
    @staticmethod
    def snapshot_to_text(snapshot: dict) -> str:
        return (
            f"Market Snapshot for Pair {snapshot.get('pairAddress')} at Block {snapshot.get('blockNumber')}. "
            f"Reserves: {snapshot.get('reserve0')} (Token0), {snapshot.get('reserve1')} (Token1). "
            f"Spot Price: {snapshot.get('spotPrice')}. "
            f"Cumulative Prices: {snapshot.get('price0Cumulative')} / {snapshot.get('price1Cumulative')}. "
            f"Timestamp: {snapshot.get('blockTimestamp')}."
        )

    def upsert_snapshot(self, snapshot: dict) -> bool:
        """Embed and store one market snapshot. Returns False if unavailable."""
        if not self._ensure_ready():
            return False

        from qdrant_client.models import PointStruct

        text = self.snapshot_to_text(snapshot)
        vector = self._embed(text)

        self._client.upsert(
            collection_name=self.collection_name,
            points=[
                PointStruct(
                    id=int(snapshot["id"]),
                    vector=vector,
                    payload={
                        "text": text,
                        "pairAddress": snapshot.get("pairAddress"),
                        "blockNumber": snapshot.get("blockNumber"),
                        "spotPrice": snapshot.get("spotPrice"),
                        "timestamp": snapshot.get("blockTimestamp"),
                    },
                )
            ],
        )
        return True

    def search_history(self, query_text: str, limit: int = 5) -> list[dict]:
        """Similarity search over stored snapshots; [] when the store is unavailable."""
        if not self._ensure_ready():
            return []

        try:
            query_vector = self._embed(query_text)
            # qdrant-client >= 1.12 prefers query_points; older versions use search
            if hasattr(self._client, "query_points"):
                response = self._client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    limit=limit,
                )
                points = getattr(response, "points", response)
            else:  # pragma: no cover - legacy client
                points = self._client.search(
                    collection_name=self.collection_name,
                    query_vector=query_vector,
                    limit=limit,
                )
            return [point.payload for point in points]
        except Exception as exc:  # noqa: BLE001
            print(f"[vector-store] search failed: {exc}", file=sys.stderr)
            return []

    def count(self) -> int:
        if not self._ensure_ready():
            return 0
        try:
            return self._client.count(self.collection_name).count
        except Exception:
            return 0

    def close(self) -> None:
        """Close the local Qdrant client before interpreter shutdown."""
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None
        self._ready = False


vector_store = VectorStore()

# Qdrant's local client must be closed while imports still work, otherwise its
# finalizer prints an ImportError during interpreter shutdown.
import atexit  # noqa: E402

atexit.register(vector_store.close)
