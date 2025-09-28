# Admin Panel: Translation and Context Settings

This document provides instructions for adding new settings to the admin panel UI, specifically within the `GeneralSettings.tsx` component. These settings will allow administrators to control the quality and context of text sent to the LLM for translation and analysis.

## 1. UI Implementation

The new settings should be added to a relevant section in the "General Settings" page, such as under a new "Actions & Context" tab or within the existing "LLM" tab.

### 1.1. On-Demand Translation Quality

-   **UI Element:** A dropdown menu.
-   **Label:** "On-Demand Translation Quality"
-   **Description:** "Controls the context for the on-demand 'Translate' button. 'High' sends both Hebrew and English for better context, while 'Fast' sends only English."
-   **Options:**
    -   `high` (High)
    -   `fast` (Fast)

### 1.2. Study Mode Context

-   **UI Element:** A dropdown menu.
-   **Label:** "Study Mode Context"
-   **Description:** "Determines what text is sent to the LLM when asking questions in Study Mode."
-   **Options:**
    -   `hebrew_and_english` (Hebrew and English)
    -   `english_only` (English Only)
    -   `hebrew_only` (Hebrew Only)

## 2. Backend Integration

Interaction with the backend is handled via the `/admin/config` endpoint.

### 2.1. Fetching Current Settings

-   **Endpoint:** `GET /admin/config`
-   **Action:** On component mount, fetch the entire configuration object.
-   **Example Response Data:**
    ```json
    {
      "llm": { ... },
      "actions": {
        "translation": {
          "on_demand_quality": "high"
        },
        "context": {
          "study_mode_context": "english_only"
        }
      },
      ...
    }
    ```
-   **Implementation:** Use the values from `actions.translation.on_demand_quality` and `actions.context.study_mode_context` to populate the initial state of your dropdown menus.

### 2.2. Updating Settings

-   **Endpoint:** `PATCH /admin/config`
-   **Action:** When a user changes the value of a dropdown, send a request to this endpoint.
-   **Request Body:** The body should be a JSON object containing only the key(s) that have changed. The keys must be dot-separated strings.

    -   **Example 1: Changing Study Mode Context**
        ```json
        {
          "actions.context.study_mode_context": "hebrew_only"
        }
        ```

    -   **Example 2: Changing Translation Quality**
        ```json
        {
          "actions.translation.on_demand_quality": "fast"
        }
        ```
-   **Response:** The endpoint will respond with the full, updated configuration object. You can use this response to re-sync your component's state if needed.
