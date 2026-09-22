"""
Vector_Store.py -- Qdrant-backed memory of historical market snapshots.

Uses TF-IDF-style embeddings for semantic similarity search over market data.
The store is initialised lazily and degrades gracefully: if Qdrant is
unavailable the search tools simply return an empty list instead of breaking
the agent loop.
"""

from __future__ import annotations

import hashlib
import math
import os
import re
import sys
from collections import Counter

from dotenv import load_dotenv

load_dotenv()

# Embedding dimension - TF-IDF style with character n-grams
EMBEDDING_SIZE = 384

# Vocabulary for market-related terms
MARKET_VOCAB = [
    # Token types
    "usdc", "dai", "wbtc", "weth", "link", "uni", "eth", "btc", "token",
    # Pool/AMM terms
    "pool", "pair", "reserve", "liquidity", "swap", "trade", "amm", "lp",
    "mint", "burn", "add", "remove", "provide",
    # Price terms
    "price", "spot", "twap", "oracle", "cumulative", "rate", "value",
    "high", "low", "average", "mean", "deviation", "volatility",
    # Direction terms
    "bull", "bear", "up", "down", "increase", "decrease", "rise", "fall",
    "momentum", "trend", "reversal", "breakout",
    # Volume terms
    "volume", "amount", "size", "big", "small", "large",
    # Risk terms
    "risk", "safe", "danger", "stable", "volatile", "risk",
    # Action terms
    "buy", "sell", "hold", "execute", "stop", "start", "active", "inactive",
    # Time terms
    "block", "timestamp", "recent", "history", "past", "current", "latest",
    # Market state
    "market", "context", "state", "status", "summary",
]


def _tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words and character n-grams."""
    text = text.lower()
    # Extract words
    words = re.findall(r"[a-z0-9]+", text)
    # Add character n-grams for sub-word matching
    ngrams = []
    for word in words:
        if len(word) >= 3:
            for i in range(len(word) - 2):
                ngrams.append(word[i:i+3])
    return words + ngrams


def _compute_tfidf_embedding(text: str, vocab: list[str]) -> list[float]:
    """Compute a TF-IDF-style embedding using vocabulary matching.

    This creates a dense vector where:
    - Each dimension corresponds to a term in the vocabulary
    - Value is TF-IDF weighted frequency of that term in the text
    - Normalized to unit vector for cosine similarity
    """
    tokens = _tokenize(text)
    token_counts = Counter(tokens)

    # Compute TF (term frequency)
    total_tokens = len(tokens) if tokens else 1
    tf = {token: count / total_tokens for token, count in token_counts.items()}

    # Build embedding vector
    vector = []
    for term in vocab:
        # Simple TF score with log smoothing
        score = tf.get(term, 0.0)
        if score > 0:
            # Apply log scaling to prevent high-frequency terms from dominating
            score = 1.0 + math.log(score * 100 + 1)
        vector.append(score)

    # Pad or truncate to EMBEDDING_SIZE
    while len(vector) < EMBEDDING_SIZE:
        vector.append(0.0)
    vector = vector[:EMBEDDING_SIZE]

    # Normalize to unit vector
    magnitude = math.sqrt(sum(x * x for x in vector))
    if magnitude > 0:
        vector = [x / magnitude for x in vector]

    return vector


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
        """Generate a semantic embedding from text using TF-IDF vocabulary matching.

        This creates meaningful vectors where similar market conditions
        produce similar embeddings, enabling proper similarity search.
        """
        return _compute_tfidf_embedding(text, MARKET_VOCAB)

    # ── public API ────────────────────────────────────────────────────────
    @staticmethod
    def snapshot_to_text(snapshot: dict) -> str:
        """Convert a market snapshot to searchable text."""
        # Extract key features for embedding
        pair = snapshot.get("pairAddress", "")
        reserve0 = snapshot.get("reserve0", "0")
        reserve1 = snapshot.get("reserve1", "0")
        spot_price = snapshot.get("spotPrice", "0")
        block = snapshot.get("blockNumber", 0)
        token0_sym = snapshot.get("token0Symbol", "")
        token1_sym = snapshot.get("token1Symbol", "")

        # Determine price direction from reserves
        try:
            r0 = float(reserve0) if reserve0 else 0
            r1 = float(reserve1) if reserve1 else 0
            price_ratio = r1 / r0 if r0 > 0 else 0
        except (ValueError, TypeError, ZeroDivisionError):
            price_ratio = 0

        # Build descriptive text
        parts = [
            f"Market Snapshot for {token0_sym}/{token1_sym} pair at block {block}.",
            f"Reserves: {reserve0} {token0_sym}, {reserve1} {token1_sym}.",
            f"Spot Price: {spot_price}.",
        ]

        # Add price state description
        if price_ratio > 0:
            if price_ratio > 2:
                parts.append("High price ratio indicates token1 is expensive relative to token0.")
            elif price_ratio < 0.5:
                parts.append("Low price ratio indicates token0 is expensive relative to token1.")
            else:
                parts.append("Balanced price ratio between tokens.")

        # Add reserve size description
        try:
            total_reserve = float(reserve0 or 0) + float(reserve1 or 0)
            if total_reserve > 1000000:
                parts.append("Large pool with high liquidity.")
            elif total_reserve > 100000:
                parts.append("Medium pool with moderate liquidity.")
            elif total_reserve > 0:
                parts.append("Small pool with low liquidity.")
        except (ValueError, TypeError):
            pass

        return " ".join(parts)

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
                        "token0Symbol": snapshot.get("token0Symbol"),
                        "token1Symbol": snapshot.get("token1Symbol"),
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
