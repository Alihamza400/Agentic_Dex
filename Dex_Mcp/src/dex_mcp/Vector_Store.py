import os
import json
import google.generativeai as genai
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

class VectorStore:
    def __init__(self, collection_name="dex_market_history"):
        # Use a persistent path for the vector database
        db_path = os.path.join(os.path.dirname(__file__), "qdrant_db")
        self.client = QdrantClient(path=db_path) 
        self.collection_name = collection_name
        self.vector_size = 3072 # Size for gemini-embedding-001
        
        # Create collection if it doesn't exist
        self._ensure_collection()

    def _ensure_collection(self):
        try:
            collection_info = self.client.get_collection(self.collection_name)
            if collection_info.config.params.vectors.size != self.vector_size:
                print(f"Collection size mismatch. Recreating...")
                self.client.delete_collection(self.collection_name)
                self._create_collection()
        except Exception:
            self._create_collection()

    def _create_collection(self):
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
        )
        print(f"Collection '{self.collection_name}' created.")

    def get_embedding(self, text):
        """Generate embedding using Gemini's gemini-embedding-001 model."""
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_document",
            title="DEX Market History"
        )
        return result['embedding']

    def snapshot_to_text(self, snapshot):
        """Convert a MySQL snapshot record into a descriptive string for embedding."""
        return (
            f"Market Snapshot for Pair {snapshot['pairAddress']} at Block {snapshot['blockNumber']}. "
            f"Reserves: {snapshot['reserve0']} (Token0), {snapshot['reserve1']} (Token1). "
            f"Spot Price: {snapshot['spotPrice']}. "
            f"Cumulative Prices: {snapshot['price0Cumulative']} / {snapshot['price1Cumulative']}. "
            f"Timestamp: {snapshot['blockTimestamp']}."
        )

    async def upsert_snapshot(self, snapshot):
        """Embeds and stores a market snapshot in Qdrant."""
        text = self.snapshot_to_text(snapshot)
        vector = self.get_embedding(text)
        
        point = PointStruct(
            id=snapshot['id'],
            vector=vector,
            payload={
                "text": text,
                "pairAddress": snapshot['pairAddress'],
                "blockNumber": snapshot['blockNumber'],
                "spotPrice": snapshot['spotPrice'],
                "timestamp": snapshot['blockTimestamp']
            }
        )
        
        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )

    def search_history(self, query_text, limit=5):
        """Performs a vector search for relevant market patterns."""
        query_vector = self.get_embedding(query_text)
        
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=limit
        )
        
        return [res.payload for res in results]

# Singleton instance
vector_store = VectorStore()
