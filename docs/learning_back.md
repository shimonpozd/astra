# Backend Implementation Summary: Study Desk v1

This document summarizes the backend work completed for the new "Study Desk" architecture, as per the `learning.md` plan.

## 1. Core Modules Created

*   **`brain/study_state.py`:** A new module responsible for all state management in Redis. It implements the "snapshot" history logic, including functions to push new states (`push_new_snapshot`), replace the current state (`replace_top_snapshot`), move the cursor (for back/forward), and restore to a specific point in history. It also handles updating the local chat history for a given focus.

*   **`brain/study_utils.py`:** A new module containing the complex data fetching and processing logic.
    *   Implements `get_text_with_window` to fetch a focus text along with its surrounding context (previous/next passages). *Note: The neighbor-finding logic for Talmud page transitions is still a placeholder.*
    *   Implements `get_bookshelf_for` to fetch and sort commentators based on relevance and authority. *Note: Text previews are currently placeholders.*
    *   Includes helpers for parsing references and detecting collections.

## 2. New API Endpoints Implemented

A new set of endpoints under the `/study/` prefix has been added to `brain/main.py`. These endpoints are deterministic and do not rely on an LLM for navigation.

*   **`POST /study/resolve`**
*   **`POST /study/set_focus`** (with `navigation_type`)
*   **`POST /study/back` & `POST /study/forward`**
*   **`POST /study/restore`**
*   **`POST /study/chat`**
*   **`GET /study/state`**

## 3. Deprecation
The old LLM-driven navigation flow is now superseded by this new architecture for study-related interactions. The `/chat/stream` endpoint remains for other agent personalities.

---

## Next Steps (v2 Plan)

1.  **Implement Lexicon Endpoint:**
    *   Create `GET /study/lexicon` which will proxy requests to the Sefaria Word/Lexicon API.
2.  **Implement Workbench Feature:**
    *   Modify `StudySnapshot` to include `workbench_items` and `discussion_focus_ref`.
    *   Create new endpoints (`/study/workbench/add`, `/study/chat/set_focus`) to manage the workbench state.
