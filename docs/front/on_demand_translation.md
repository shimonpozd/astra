# Frontend Implementation: On-Demand Translation

This document outlines the steps for implementing the on-demand translation feature in the web client.

## 1. Goal

The objective is to allow users to translate text segments directly within the UI. This feature should be available in two key locations:

1.  **Focus Reader:** For translating the main text being studied.
2.  **Workbench Panels:** For translating commentary or source texts.

## 2. Backend API Endpoint

The backend provides a single endpoint to handle translations.

-   **URL:** `POST /api/actions/translate`
-   **Description:** Sends Hebrew and English text to the LLM for a high-quality, context-aware translation.
-   **Request Body:**
    ```json
    {
      "hebrew_text": "<The Hebrew text to translate>",
      "english_text": "<The existing English translation (optional)>"
    }
    ```
-   **Note:** The `english_text` field is optional. If it is not available, the frontend should still send the request with the `hebrew_text`. The backend will handle the translation using only the Hebrew text in this case.
-   **Success Response (200 OK):**
    The endpoint will stream the translation back to the client as a `text/event-stream`. The frontend should read the stream and append the chunks to the display.

## 3. Implementation Details

### 3.1. File 1: `src/components/study/FocusReader.tsx`

-   **Target Component:** The implementation should be within the `TextSegmentComponent`.
-   **Trigger:** Add a "Translate" button or a suitable icon (e.g., a globe or language symbol). This UI element should ideally appear when a segment is in focus (i.e., when the `isFocus` prop is `true`) or on hover.
-   **Action:**
    1.  On click, trigger a function that makes a `POST` request to the `/api/actions/translate` endpoint.
    2.  The request body must be populated using the data available in the `segment` prop:
        -   `hebrew_text`: `segment.heText`
        -   `english_text`: `segment.text`
-   **Displaying the Result:**
    1.  The component needs to manage a new state, for example, `translatedText`.
    2.  When the API call is initiated, the `translatedText` state should be cleared.
    3.  As chunks of the translation are received from the stream, they should be appended to the `translatedText` state.
    4.  Render the `translatedText` in place of the original segment text.
    5.  **Crucially**, provide a "Revert" or "Show Original" button to allow the user to switch back to the original text.

### 3.2. File 2: `src/components/study/WorkbenchPanelInline.tsx`

-   **Target Component:** The implementation should be within the `WorkbenchContent` component.
-   **Trigger:** Add a "Translate" button or icon near the text content.
-   **Action:**
    1.  On click, trigger a function that makes a `POST` request to `/api/actions/translate`.
    2.  The request body must be populated using the data from the `item` prop:
        -   `hebrew_text`: `item.heTextFull`
        -   `english_text`: `item.text_full`
-   **Displaying the Result:**
    1.  Similar to the `FocusReader`, manage a state for the translated text.
    2.  On a successful API response, display the translation.
    3.  Provide a mechanism to revert to the original text.

## 4. Suggested Enhancement (Recommended)

To avoid code duplication, consider creating a new, reusable component (e.g., `TranslateButton.tsx` or a hook like `useTranslation`).

This component could handle:
-   The API call logic.
-   State management for the translated text and loading/error states.
-   Rendering the button and the logic for displaying the translation/reverting to the original.

This new component could then be imported and used in both `TextSegmentComponent` and `WorkbenchContent` with the appropriate text props passed to it.
