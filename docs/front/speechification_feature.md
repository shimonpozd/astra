# Frontend Implementation: Speechification Feature

This document outlines the steps for implementing the "Speechification" (text-to-speech) feature in the web client.

## 1. Goal

The objective is to allow users to listen to text content from various parts of the application. This will be achieved by adding a "Speechify" or "Listen" button to four key locations.

## 2. Locations for the "Speechify" Button

1.  **Focus Reader:** A button should be available for the currently focused text segment.
2.  **Workbench (Left Panel):** A button for the text in the left workbench panel.
3.  **Workbench (Right Panel):** A button for the text in the right workbench panel.
4.  **Chat Messages:** Each assistant message in the chat should have a speechify button.

## 3. Backend API Endpoint

The backend provides a single endpoint to handle speechification.

-   **URL:** `POST /actions/speechify`
-   **Request Body:** The body should contain the text to be speechified. All fields are optional, but at least one should be provided.
    ```json
    {
      "text": "<Generic text to speechify>",
      "hebrew_text": "<The Hebrew text>",
      "english_text": "<The English text>"
    }
    ```
-   **Response:** The endpoint streams back an audio file (`audio/wav`).

## 4. Implementation Details

### 4.1. Adding the Buttons

-   **`FocusReader.tsx`:** In the `TextSegmentComponent`, add a "Speechify" button that is visible when the segment is in focus (`isFocus` is true).
-   **`WorkbenchPanelInline.tsx`:** In the `WorkbenchContent` component, add a "Speechify" button.
-   **Chat Messages:** In the component that renders assistant chat messages, add a "Speechify" button to each message.

### 4.2. API Call Logic

When a "Speechify" button is clicked:

1.  **Determine the text source:**
    -   For `FocusReader`, use `segment.text` for `english_text` and `segment.heText` for `hebrew_text`.
    -   For `WorkbenchPanelInline`, use `item.text_full` for `english_text` and `item.heTextFull` for `hebrew_text`.
    -   For chat messages, the full text of the message should be passed as the `text` field.
2.  **Make the API call:** Make a `POST` request to `/actions/speechify` with the appropriate text fields in the body.

### 4.3. Handling the Audio Response

1.  The response from the API will be an audio stream.
2.  Use the browser's audio APIs to play the stream. A simple way to do this is:
    ```typescript
    const response = await fetch(...);
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
    ```
3.  You should also implement UI feedback to indicate that the audio is loading and playing, and provide a way to stop the audio.

## 5. Admin Panel Settings

Two new settings in the admin panel are required for this feature.

### 5.1. Model Selection

-   **Goal:** Allow administrators to choose the LLM model for the speechification task.
-   **Implementation:** Follow the instructions in `docs/front/admin_panel_llm_overrides.md` to add a text input for the `llm.overrides.speechify` setting.

### 5.2. Language Preference

-   **Goal:** Allow administrators to choose which language to use for speechification when both English and Hebrew are available.
-   **UI Element:** A dropdown menu in the admin panel.
-   **Label:** "Speechify Language Preference"
-   **Setting Key:** `actions.speechify.language_preference`
-   **Options:**
    -   `english_only` (English Only)
    -   `hebrew_only` (Hebrew Only)
    -   `hebrew_and_english` (Hebrew and English)
-   **Implementation:** Use the `GET /admin/config` and `PATCH /admin/config` endpoints to read and write this setting, similar to the other admin panel settings.
