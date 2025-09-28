import asyncio
import logging
import time
from neo4j import AsyncGraphDatabase, EagerResult, RoutingControl
from typing import Optional, Dict, Any, List, Tuple

from .config import settings
from . import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GraphDB:
    def __init__(self, uri: str, user: str, password: str):
        self._uri = uri
        self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
        self._is_closed = False
        logger.info("Neo4j driver initialized.")

    async def close(self):
        if not self._is_closed:
            await self._driver.close()
            self._is_closed = True
            logger.info("Neo4j driver closed.")

    async def ping(self) -> bool:
        try:
            await self._driver.verify_connectivity()
            return True
        except Exception as e:
            logger.error(f"Neo4j ping failed: {e}")
            return False

    async def run_query(self, query: str, params: Optional[Dict[str, Any]] = None, read_only: bool = False) -> EagerResult:
        params = params or {}
        routing = RoutingControl.READ if read_only else RoutingControl.WRITE
        start_time = time.time()
        try:
            result = await self._driver.execute_query(
                query, params, database_="neo4j", routing_=routing
            )
            duration_ms = (time.time() - start_time) * 1000
            logger.info(f"Query executed in {duration_ms:.2f}ms. Query: {query[:100]}...")
            return result
        except Exception as e:
            logger.error(f"Neo4j query failed: {e}\nQuery: {query}\nParams: {params}")
            raise

    async def create_constraints_and_indices(self):
        logger.info("Creating Neo4j constraints and indices...")
        await self.run_query("CREATE CONSTRAINT IF NOT EXISTS FOR (u:Utterance) REQUIRE u.utt_id IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Session) REQUIRE s.session_id IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT IF NOT EXISTS FOR (i:Intent) REQUIRE i.name IS UNIQUE")
        await self.run_query("CREATE INDEX utterance_session_ts_index IF NOT EXISTS FOR (u:Utterance) ON (u.session_id, u.ts)")
        await self.run_query("CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.fact_id IS UNIQUE")
        await self.run_query("CREATE INDEX fact_date_int IF NOT EXISTS FOR (f:Fact) ON (f.date_int)")
        await self.run_query("CREATE INDEX fact_timestamp IF NOT EXISTS FOR (f:Fact) ON (f.timestamp)")
        await self.run_query("CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT topic_slug IF NOT EXISTS FOR (t:Topic) REQUIRE t.slug IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT entity_slug IF NOT EXISTS FOR (e:Entity) REQUIRE e.slug IS UNIQUE")
        await self.run_query("CREATE FULLTEXT INDEX factTextIdx IF NOT EXISTS FOR (f:Fact) ON EACH [f.text]")
    async def create_constraints_and_indices(self):
        logger.info("Creating Neo4j constraints and indices...")
        await self.run_query("CREATE CONSTRAINT IF NOT EXISTS FOR (u:Utterance) REQUIRE u.utt_id IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Session) REQUIRE s.session_id IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT IF NOT EXISTS FOR (i:Intent) REQUIRE i.name IS UNIQUE")
        await self.run_query("CREATE INDEX utterance_session_ts_index IF NOT EXISTS FOR (u:Utterance) ON (u.session_id, u.ts)")
        await self.run_query("CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.fact_id IS UNIQUE")
        await self.run_query("CREATE INDEX fact_date_int IF NOT EXISTS FOR (f:Fact) ON (f.date_int)")
        await self.run_query("CREATE INDEX fact_timestamp IF NOT EXISTS FOR (f:Fact) ON (f.timestamp)")
        await self.run_query("CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT topic_slug IF NOT EXISTS FOR (t:Topic) REQUIRE t.slug IS UNIQUE")
        await self.run_query("CREATE CONSTRAINT entity_slug IF NOT EXISTS FOR (e:Entity) REQUIRE e.slug IS UNIQUE")
        await self.run_query("CREATE FULLTEXT INDEX factTextIdx IF NOT EXISTS FOR (f:Fact) ON EACH [f.text]")
        await self.run_query(
        """
        CREATE VECTOR INDEX factEmbIdx IF NOT EXISTS
        FOR (f:Fact) ON (f.embedding)
        OPTIONS { indexConfig: { \"vector.dimensions\": 1536, \"vector.similarity_function\": 'cosine' } }
        """ )
        logger.info("Neo4j constraints and indices are up to date.")
        await self.run_query(
        """
        CREATE VECTOR INDEX factEmbIdx IF NOT EXISTS
        FOR (f:Fact) ON (f.embedding)
        OPTIONS { indexConfig: { \"vector.dimensions\": 1536, \"vector.similarity_function\": 'cosine' } }
        """ )
        logger.info("Neo4j constraints and indices are up to date.")

    async def get_facts_by_topics(self, topics: List[str], limit: int = 3) -> List[Dict[str, Any]]:
        query = """
        MATCH (t:Topic)<-[:MENTIONS]-(f:Fact)
        WHERE t.slug IN $topics
        RETURN {
          fact_id: f.fact_id,
          text: f.text,
          speaker: f.speaker,
          timestamp: coalesce(f.timestamp.epochSeconds, 0),
          confidence: coalesce(f.confidence, 0.80),
          source: 'neo4j_topic'
        } AS fact
        ORDER BY f.timestamp DESC
        """
        result = await self.run_query(query, {"topics": topics}, read_only=True)
        return [record["fact"] for record in result.records][:limit]

    async def get_facts_by_fulltext(self, q: str, topics: Optional[List[str]] = None, limit: int = 3) -> List[Dict[str, Any]]:
        query = """
        CALL db.index.fulltext.queryNodes('factTextIdx', $q) YIELD node, score
        WHERE $topics IS NULL OR EXISTS {
            MATCH (node)-[:MENTIONS]->(t:Topic)
            WHERE t.slug IN $topics
        }
        RETURN {
            fact_id: node.fact_id, 
            text: node.text, 
            speaker: node.speaker, 
            timestamp: coalesce(node.timestamp.epochSeconds, 0), 
            confidence: score,
            source: 'neo4j_fulltext'
        } AS fact
        ORDER BY score DESC
        """
        result = await self.run_query(query, {"q": q, "topics": topics}, read_only=True)
        return [record["fact"] for record in result.records][:limit]

    async def get_facts_by_knn(self, embedding: List[float], k: int = 3) -> List[Dict[str, Any]]:
        query = """
        CALL db.index.vector.queryNodes('factEmbIdx', $k, $embedding) YIELD node, score
        RETURN {
            fact_id: node.fact_id,
            text: node.text, 
            speaker: node.speaker, 
            timestamp: coalesce(node.timestamp.epochSeconds, 0), 
            confidence: score,
            source: 'neo4j_knn'
        } AS fact
        ORDER BY score DESC
        """
        # LIMIT is passed as k in the CALL procedure, no need to limit here
        result = await self.run_query(query, {"k": k, "embedding": embedding}, read_only=True)
        return [record["fact"] for record in result.records]

    async def update_dialog(self, req: models.DialogUpdateRequest):
        utt_id = f"{req.session_id}-{req.ts}"
        query = """
        MERGE (u:Utterance {utt_id: $utt_id})
        SET u.session_id = $session_id, u.ts = datetime($ts), u.speaker = $speaker, u.text = $text
        MERGE (s:Session {session_id: $session_id}) ON CREATE SET s.start_ts = u.ts SET s.end_ts = u.ts
        MERGE (u)-[:IN]->(s)
        WITH u
        MATCH (prev:Utterance {session_id: $session_id}) WHERE prev.ts < u.ts
        WITH u, prev ORDER BY prev.ts DESC LIMIT 1
        MERGE (prev)-[:FOLLOWS {ts_edge: u.ts}]->(u)
        WITH u
        UNWIND $topics AS topic_slug
        MERGE (t:Topic {slug: topic_slug})
        MERGE (u)-[:MENTIONS {ts_edge: u.ts, w0: 0.7}]->(t)
        """
        params = { "utt_id": utt_id, "session_id": req.session_id, "ts": req.ts, "speaker": req.speaker, "text": req.text, "topics": req.topics }
        await self.run_query(query, params)
        logger.info(f"Added utterance {utt_id} to the graph.")

    async def get_context(self, session_id: str, horizon_utterances: int, horizon_minutes: int, tau_sec: int) -> Tuple[List[Dict], List[Dict]]:
        # This query is reverted to a simpler, stable version.
        # The more optimized UNION-based query requires further refinement.
        topics_query = """
        MATCH (u1:Utterance {session_id: $session_id})
        WITH u1 ORDER BY u1.ts DESC LIMIT $horizon_utterances
        MATCH (u2:Utterance {session_id: $session_id})
        WHERE u2.ts > datetime() - duration({minutes: $horizon_minutes})
        WITH collect(u1) + collect(u2) AS combined_utterances
        UNWIND combined_utterances AS u
        WITH DISTINCT u
        MATCH (u)-[r:MENTIONS]->(t:Topic)
        WITH t, r, (datetime().epochSeconds - r.ts_edge.epochSeconds) AS age_seconds
        WITH t, age_seconds, r.w0 * exp(-toFloat(age_seconds) / $tau_sec) AS score
        RETURN t.slug AS topic_slug, t.name AS topic_name, sum(score) AS total_score
        ORDER BY total_score DESC
        LIMIT 3
        """
        recents_query = """
        MATCH (u:Utterance {session_id: $session_id})
        RETURN u.speaker AS speaker, u.text AS text, u.ts AS ts
        ORDER BY u.ts DESC
        LIMIT $horizon_utterances
        """
        params = {"session_id": session_id, "horizon_utterances": horizon_utterances, "horizon_minutes": horizon_minutes, "tau_sec": tau_sec}
        try:
            topics_res_task = self.run_query(topics_query, params, read_only=True)
            recents_res_task = self.run_query(recents_query, params, read_only=True)
            topics_res, recents_res = await asyncio.gather(topics_res_task, recents_res_task)
            top_topics = [dict(record) for record in topics_res.records]
            recent_utterances = [dict(record) for record in recents_res.records]
            return top_topics, recent_utterances
        except Exception as e:
            logger.error(f"Failed to get context for session {session_id}: {e}")
            return [], []

    

    

# Global instance
graph_db_client = GraphDB(
    uri=settings.neo4j_url,
    user=settings.neo4j_user,
    password=settings.neo4j_password,
)
