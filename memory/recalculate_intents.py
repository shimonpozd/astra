
import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from .config import settings
from .graph_db import graph_db_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_intent_recalculation():
    """Fetches recent dialog history, recalculates intent transition probabilities,
    and updates the I-graph in Neo4j.
    """
    logger.info("Starting intent graph recalculation process...")
    try:
        # 1. Get intent sequences from the last K sessions
        query = """
        MATCH (s:Session)
        WITH s ORDER BY s.start_ts DESC
        LIMIT $last_k_sessions
        MATCH (s)<-[:IN]-(u:Utterance)
        WHERE u.intent IS NOT NULL
        WITH u.session_id AS session, u.ts AS ts, u.intent AS intent
        ORDER BY session, ts
        RETURN session, collect(intent) AS intents
        """
        params = {"last_k_sessions": settings.intent_recalc_last_k_sessions}
        result = await graph_db_client.run_query(query, params)
        
        # 2. Build transition count matrix
        transitions = defaultdict(lambda: defaultdict(int))
        for record in result.records:
            intents = record["intents"]
            for i in range(len(intents) - 1):
                prev_intent = intents[i]
                curr_intent = intents[i+1]
                if prev_intent and curr_intent:
                    transitions[prev_intent][curr_intent] += 1
        
        if not transitions:
            logger.warning("No intent transitions found in the last K sessions. Aborting.")
            return

        # 3. Calculate probabilities and prepare for update
        update_payload = []
        for prev_intent, next_intents in transitions.items():
            total_transitions = sum(next_intents.values())
            if total_transitions == 0: continue
            
            for curr_intent, count in next_intents.items():
                update_payload.append({
                    "prev_intent": prev_intent,
                    "curr_intent": curr_intent,
                    "count": count,
                    "p": count / total_transitions
                })

        # 4. Update the graph with new counts and probabilities
        update_query = """
        UNWIND $transitions AS t
        MATCH (prev:Intent {name: t.prev_intent})
        MATCH (curr:Intent {name: t.curr_intent})
        MERGE (prev)-[r:NEXT]->(curr)
        SET r.count = t.count, r.p = t.p
        """
        await graph_db_client.run_query(update_query, {"transitions": update_payload})
        logger.info(f"Updated {len(update_payload)} intent transitions in the graph.")

        # 5. Update the state node with the last recalculated timestamp
        state_query = """
        MERGE (s:IgraphState {id: 'singleton'})
        SET s.last_recalculated = datetime()
        """
        await graph_db_client.run_query(state_query)
        logger.info("Intent graph recalculation process completed successfully.")

    except Exception as e:
        logger.error(f"An error occurred during intent recalculation: {e}", exc_info=True)

if __name__ == '__main__':
    asyncio.run(run_intent_recalculation())
