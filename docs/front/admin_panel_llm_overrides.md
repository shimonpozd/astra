# Frontend Implementation: Admin Panel LLM Overrides

This document outlines the steps for adding new LLM model override settings to the admin panel UI.

## 1. Goal

The objective is to allow administrators to specify which LLM models are used for the `translator`, `lexicon`, and `speechify` tasks. This provides fine-grained control over the application's behavior.

## 2. UI Implementation

The new settings should be added to the "LLM Settings" section of the admin panel. For each task, a text input field should be provided.

### 2.1. Translator Model

-   **UI Element:** Text Input
-   **Label:** "Translator Model"
-   **Description:** "The model to use for the translation task. E.g., `openrouter/x-ai/grok-4-fast:free`"

### 2.2. Lexicon Model

-   **UI Element:** Text Input
-   **Label:** "Lexicon Model"
-   **Description:** "The model to use for the lexicon (term explanation) task."

### 2.3. Speechify Model

-   **UI Element:** Text Input
-   **Label:** "Speechify Model"
-   **Description:** "The model to use for the speechify (text-to-colloquial speech) task."

## 3. Backend Integration

Interaction with the backend is handled via the `/admin/config` endpoint.

### 3.1. Fetching Current Settings

-   **Endpoint:** `GET /admin/config`
-   **Action:** On component mount, fetch the entire configuration object.
-   **Example Response Data:**
    ```json
    {
      "llm": {
        "overrides": {
          "translator": "openrouter/x-ai/grok-4-fast:free",
          "lexicon": "openrouter/x-ai/grok-4-fast:free",
          "speechify": "openrouter/x-ai/grok-4-fast:free"
        }
      },
      ...
    }
    ```
-   **Implementation:** Use the values from `llm.overrides.translator`, `llm.overrides.lexicon`, and `llm.overrides.speechify` to populate the initial state of your input fields.

### 3.2. Updating Settings

-   **Endpoint:** `PATCH /admin/config`
-   **Action:** When a user changes the value of an input field, send a request to this endpoint.
-   **Request Body:** The body should be a JSON object containing only the key(s) that have changed. The keys must be dot-separated strings.

    -   **Example: Changing the Translator Model**
        ```json
        {
          "llm.overrides.translator": "new/model-for-translation"
        }
        ```
-   **Response:** The endpoint will respond with the full, updated configuration object. You can use this response to re-sync your component's state if needed.
