import os
import json
from qdrant_client import QdrantClient, models
from dotenv import load_dotenv
import logging

# Setup basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def diagnose():
    load_dotenv(override=True)
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    collection_name = os.getenv("KGRAPH_QDRANT_COLLECTION", "my_new_embedding_collection")
    
    logging.info(f"--- Qdrant Diagnostic Script ---")
    logging.info(f"Connecting to Qdrant at: {qdrant_url}")
    logging.info(f"Target collection: {collection_name}")

    try:
        client = QdrantClient(url=qdrant_url)
        
        # 1. Check collection info and index configuration
        logging.info("\n--- 1. Checking Collection and Index Configuration ---")
        collection_info = client.get_collection(collection_name=collection_name)
        logging.info(f"Successfully connected to collection '{collection_name}'.")
        logging.info(f"Number of points: {collection_info.points_count}")
        
        # Check for the text index specifically
        text_index_exists = False
        if collection_info.payload_schema and 'text' in collection_info.payload_schema:
            index_params = collection_info.payload_schema['text']
            # The schema for a text index is TextIndexParams, which is a class, not a simple dict.
            # We check if the type is text.
            if hasattr(index_params, 'data_type') and str(index_params.data_type) == 'text':
                text_index_exists = True

        if text_index_exists:
            logging.info("✅ SUCCESS: A 'text' index with type TEXT exists. This is correct.")
        else:
            logging.error("❌ FAILURE: A TEXT index for the 'text' field was NOT found. This is the root cause of the problem.")
            logging.error("Please re-run the `upsert_to_qdrant_2.py` script to create the correct index.")

    except Exception as e:
        logging.error(f"Could not get collection info for '{collection_name}'. Error: {e}")
        logging.error("Please ensure Qdrant is running, the collection exists, and the name is correct in your .env file.")
        return

    # 2. Fetch and print a random point
    logging.info("\n--- 2. Inspecting Payload of a Random Point ---")
    try:
        random_points, _ = client.scroll(
            collection_name=collection_name,
            limit=1,
            with_payload=True
        )
        if random_points:
            logging.info("Payload of a random point:")
            logging.info(json.dumps(random_points[0].payload, indent=2, ensure_ascii=False))
        else:
            logging.warning("Collection is empty.")
    except Exception as e:
        logging.error(f"Failed to fetch a random point. Error: {e}")

    # 3. Perform a test keyword search
    test_keyword = "мстителей" # A keyword we expect to find
    logging.info(f"\n--- 3. Performing a Test Keyword Search for: '{test_keyword}' ---")
    try:
        search_results, _ = client.scroll(
            collection_name=collection_name,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="text",
                        match=models.MatchText(text=test_keyword)
                    )
                ]
            ),
            limit=5,
            with_payload=True
        )
        logging.info(f"Found {len(search_results)} results for '{test_keyword}'.")
        if search_results:
            logging.info("SUCCESS: Keyword search is working.")
            for i, point in enumerate(search_results):
                logging.info(f"  - Result {i+1}: {point.payload.get('text')}")
        else:
            logging.warning("FAILURE: Keyword search returned 0 results. This confirms the issue lies with the data or index.")
            
    except Exception as e:
        logging.error(f"Test keyword search failed. Error: {e}")

if __name__ == "__main__":
    diagnose()
