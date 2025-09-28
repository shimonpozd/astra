import asyncio
import logging
import os
import pandas as pd
import uuid
from qdrant_client import QdrantClient, models as qdrant_models

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from .graph_db import graph_db_client
from .config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define the path to the koyzah directory
KOYZAH_DIR = os.path.join(os.path.dirname(__file__), '..', 'koyzah')

# Namespace for generating UUIDs
UUID_NAMESPACE = uuid.UUID('f81d4fae-7dec-11d0-a765-00a0c91e6bf6')

async def import_sessions():
    logger.info("Importing sessions...")
    file_path = os.path.join(KOYZAH_DIR, 'session_summaries.csv')
    if not os.path.exists(file_path): return
    df = pd.read_csv(file_path)
    query = """UNWIND $rows AS row MERGE (s:Session {session_id: row.session_id}) SET s.start_ts = row.start_ts, s.end_ts = row.end_ts"""
    await graph_db_client.run_query(query, {'rows': df.to_dict('records')})
    logger.info(f"Imported {len(df)} sessions.")

async def import_utterances():
    logger.info("Importing utterances...")
    file_path = os.path.join(KOYZAH_DIR, 'utterances.csv')
    if not os.path.exists(file_path): return
    df = pd.read_csv(file_path)
    query = """UNWIND $rows AS row MERGE (u:Utterance {utt_id: row.utt_id}) SET u.session_id = row.session_id, u.ts = datetime(row.ts), u.speaker = row.speaker, u.text = row.text, u.intent = row.intent WITH u, row MATCH (s:Session {session_id: row.session_id}) MERGE (u)-[:IN]->(s)"""
    await graph_db_client.run_query(query, {'rows': df.to_dict('records')})
    logger.info(f"Imported {len(df)} utterances.")

async def import_follows():
    logger.info("Importing FOLLOWS relationships...")
    file_path = os.path.join(KOYZAH_DIR, 'edges_follows.csv')
    if not os.path.exists(file_path): return
    df = pd.read_csv(file_path)
    query = """UNWIND $rows AS row MATCH (u1:Utterance {utt_id: row.source}), (u2:Utterance {utt_id: row.target}) MERGE (u1)-[r:FOLLOWS]->(u2) SET r.ts_edge = datetime(row.ts_edge)"""
    await graph_db_client.run_query(query, {'rows': df.to_dict('records')})
    logger.info(f"Imported {len(df)} FOLLOWS relationships.")

async def import_topics():
    logger.info("Importing topics...")
    file_path = os.path.join(KOYZAH_DIR, 'topics_final.csv')
    if not os.path.exists(file_path): return
    df = pd.read_csv(file_path)
    df.dropna(subset=['topic_id_norm'], inplace=True)
    query = """UNWIND $rows AS row MERGE (t:Topic {topic_id: row.topic_id_norm}) SET t.label = row.label, t.df = row.df"""
    await graph_db_client.run_query(query, {'rows': df.to_dict('records')})
    logger.info(f"Imported {len(df)} topics.")

async def import_mentions():
    logger.info("Importing MENTIONS relationships...")
    file_path = os.path.join(KOYZAH_DIR, 'edges_mentions.csv')
    if not os.path.exists(file_path): return
    df = pd.read_csv(file_path)
    query = """UNWIND $rows AS row MATCH (u:Utterance {utt_id: row.source}), (t:Topic {topic_id: row.target}) MERGE (u)-[r:MENTIONS]->(t) SET r.ts_edge = datetime(row.ts_edge), r.w0 = 0.7"""
    await graph_db_client.run_query(query, {'rows': df.to_dict('records')})
    logger.info(f"Imported {len(df)} MENTIONS relationships.")

async def import_intents():
    logger.info("Importing intents and transitions...")
    file_path = os.path.join(KOYZAH_DIR, 'intents_transitions.csv')
    if not os.path.exists(file_path): return
    df = pd.read_csv(file_path)
    df.dropna(subset=['prev_intent', 'curr_intent'], inplace=True)
    query = """UNWIND $rows AS row MERGE (i1:Intent {name: row.prev_intent}) MERGE (i2:Intent {name: row.curr_intent}) MERGE (i1)-[r:NEXT]->(i2) SET r.count = row.count, r.p = row.p"""
    await graph_db_client.run_query(query, {'rows': df.to_dict('records')})
    logger.info(f"Imported {len(df)} intent transitions.")

async def import_concepts_to_qdrant():
    """Reads topics and concepts, vectorizes them, and uploads to Qdrant."""
    logger.info("Starting K-Graph backfill into Qdrant...")
    if settings.embedding_model_provider.lower() != "openai":
        logger.info("Skipping K-Graph backfill: embedding provider '%s' does not support OpenAI embeddings.", settings.embedding_model_provider)
        return
    if OpenAI is None:
        logger.warning("OpenAI SDK is not available; cannot perform K-Graph backfill.")
        return
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY is required for K-Graph backfill when using OpenAI embeddings.")
        return
    try:
        qdrant_cli = QdrantClient(url=settings.qdrant_url)
        openai_cli = OpenAI(api_key=settings.openai_api_key)
        collection_name = settings.KGRAPH_QDRANT_COLLECTION

        qdrant_cli.recreate_collection(
            collection_name=collection_name,
            vectors_config=qdrant_models.VectorParams(size=1536, distance=qdrant_models.Distance.COSINE),
        )
        logger.info(f"Recreated Qdrant collection '{collection_name}'.")

        topics_df = pd.read_csv(os.path.join(KOYZAH_DIR, 'topics_final.csv'))
        concepts_df = pd.read_csv(os.path.join(KOYZAH_DIR, 'concepts.csv'))
        
        facts_by_topic = concepts_df.dropna(subset=['topic_id', 'fact']).groupby('topic_id')['fact'].apply(lambda x: list(x)[:2]).to_dict()
        
        points, labels_to_embed = [], []
        for _, row in topics_df.iterrows():
            topic_id = row.get('topic_id_norm')
            label = row.get('label')
            if pd.notna(topic_id) and pd.notna(label):
                labels_to_embed.append(label)
                point_id = str(uuid.uuid5(UUID_NAMESPACE, str(topic_id)))
                points.append({
                    "id": point_id,
                    "payload": {"label": label, "facts": facts_by_topic.get(str(topic_id), []), "refs": []}
                })
        
        if not labels_to_embed: return

        embedding_res = openai_cli.embeddings.create(input=labels_to_embed, model=settings.embedding_model_name)
        embeddings = [item.embedding for item in embedding_res.data]
        
        qdrant_points = [qdrant_models.PointStruct(id=p["id"], vector=embeddings[i], payload=p["payload"]) for i, p in enumerate(points)]
        
        qdrant_cli.upsert(collection_name=collection_name, points=qdrant_points, wait=True)
        logger.info(f"Successfully uploaded {len(qdrant_points)} points to Qdrant.")

    except Exception as e:
        logger.error(f"An error occurred during the K-Graph backfill process: {e}", exc_info=True)

async def create_topic_aliases():
    logger.info("Creating topic aliases...")
    try:
        qdrant_cli = QdrantClient(url=settings.qdrant_url)
        collection_name = settings.KGRAPH_QDRANT_COLLECTION
        merge_threshold = settings.k_merge_threshold
        topics_df = pd.read_csv(os.path.join(KOYZAH_DIR, 'topics_final.csv'))
        df_map = topics_df.set_index('topic_id_norm')['df'].to_dict()
        
        all_points, _ = qdrant_cli.scroll(collection_name=collection_name, with_payload=True, with_vectors=True, limit=10000)
        
        aliases_created, processed_pairs = 0, set()
        for point in all_points:
            hits = qdrant_cli.search(collection_name=collection_name, query_vector=point.vector, limit=5, score_threshold=merge_threshold)
            for hit in hits:
                pair = tuple(sorted((point.id, hit.id)))
                if hit.id != point.id and pair not in processed_pairs:
                    processed_pairs.add(pair)
                    point_df, hit_df = df_map.get(point.id, 0), df_map.get(hit.id, 0)
                    alias_id, canonical_id = (point.id, hit.id) if point_df < hit_df else (hit.id, point.id) if hit_df < point_df else sorted((point.id, hit.id))
                    query = """
                    MATCH (alias:Topic {topic_id: $alias_id})
                    MATCH (canonical:Topic {topic_id: $canonical_id})
                    MERGE (alias)-[:ALIAS_OF]->(canonical)
                    """
                    await graph_db_client.run_query(query, {"alias_id": alias_id, "canonical_id": canonical_id})
                    aliases_created += 1

        logger.info(f"Created {aliases_created} topic alias relationships.")

        # Verify relationships were created
        verify_query = "MATCH ()-[r:ALIAS_OF]->() RETURN count(r) AS count"
        result = await graph_db_client.run_query(verify_query, read_only=True)
        count = result.records[0]["count"]
        logger.info(f"Verification: Found {count} ALIAS_OF relationships in Neo4j.")

    except Exception as e:
        logger.error(f"An error occurred during topic alias creation: {e}", exc_info=True)

async def run_backfill():
    """Main function to run the entire backfill process."""
    logger.info("Starting full backfill process...")
    try:
        await graph_db_client.create_constraints_and_indices()
        await import_sessions()
        await import_utterances()
        await import_topics()
        await import_intents()
        await import_follows()
        await import_mentions()
        await import_concepts_to_qdrant()
        await create_topic_aliases()
        logger.info("Full backfill process completed successfully.")
    except Exception as e:
        logger.error(f"An error occurred during the backfill process: {e}", exc_info=True)
    finally:
        pass

if __name__ == '__main__':
    asyncio.run(run_backfill())
