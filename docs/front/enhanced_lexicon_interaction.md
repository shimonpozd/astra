# Frontend Implementation: Enhanced Lexicon Interaction

This document outlines the steps for implementing a new user interaction to trigger the Enhanced Lexicon feature.

## 1. Goal

The objective is to change the trigger for the lexicon feature from a double-click to a more flexible text selection and key press combination. This will allow users to look up single words, phrases, or parts of words.

-   **Old Interaction:** Double-clicking a word.
-   **New Interaction:** Selecting a piece of text and pressing the `Enter` key.

## 2. Backend API Endpoint

The backend endpoint for this feature is already implemented.

-   **URL:** `POST /actions/explain-term`
-   **Request Body:**
    ```json
    {
      "term": "<The selected text>",
      "context_text": "<The full text of the segment or paragraph>"
    }
    ```
-   **Response:** The endpoint returns a `text/event-stream` with the LLM-generated explanation.

## 3. Implementation Details

This new interaction should be implemented in the components that display translatable text, primarily `FocusReader.tsx` and `WorkbenchPanelInline.tsx`.

### 3.1. Capturing the Text Selection

A robust way to implement this is to use a global `mouseup` event listener.

1.  **Create a new hook** (e.g., `useTextSelectionListener.ts`) or add this logic to a high-level component (like `App.tsx`).
2.  **Add a `mouseup` event listener** to the `document`.
3.  When the event fires, use `window.getSelection()` to get the current selection.
4.  If `selection.toString()` is not empty, it means the user has selected text. Store this selected text and the surrounding context (the full paragraph or segment) in a state management store (e.g., Zustand or Redux).

### 3.2. Capturing the `Enter` Key Press

1.  **Add a `keydown` event listener** to the `document`.
2.  When the event fires, check if the pressed key is `Enter`.
3.  If it is, check your state store to see if there is an active text selection.
4.  If there is, prevent the default `Enter` key behavior (`e.preventDefault()`) and proceed.

### 3.3. Triggering the API Call

1.  When the `Enter` key is pressed on a selection, call a function that makes a `POST` request to the `/actions/explain-term` endpoint.
2.  The request body should be populated from the data you stored in the state:
    -   `term`: The selected text.
    -   `context_text`: The surrounding context text.

### 3.4. Displaying the Result in the Chat Panel

The key to displaying the lexicon result in the chat panel is to use a global state management solution (like Zustand, which is already used in this project). The lexicon explanation is not part of the regular chat history and should be treated as a temporary, dismissible message.

1.  **Create a new state slice** in your Zustand store specifically for the lexicon feature. This slice should manage:
    *   `explanation`: A string to hold the streamed explanation text.
    *   `isLoading`: A boolean to indicate when the explanation is being fetched.
    *   `error`: A string to hold any potential error messages.

2.  **Update the state from the API call:**
    *   When the API call to `/actions/explain-term` is initiated, set `isLoading` to `true` and clear any previous `explanation` and `error`.
    *   As you receive chunks from the `text/event-stream`, append them to the `explanation` string in the store.
    *   If there's an error, set the `error` state.
    *   When the stream is complete, set `isLoading` to `false`.

3.  **Render the temporary message in the chat component:**
    *   The main chat component (e.g., `Chat.tsx` or similar) should subscribe to this lexicon state slice.
    *   If `explanation`, `isLoading`, or `error` is not empty, render a new, temporary message component at the bottom of the chat, separate from the historical messages.
    *   This temporary message component should:
        *   Be visually distinct (e.g., have a different background color or an icon).
        *   Display the streamed `explanation` text as it arrives.
        *   Show a loading indicator when `isLoading` is `true`.
        *   Display an error message if `error` is set.
        *   Have a "Dismiss" (`X`) button that clears the lexicon state slice (sets `explanation`, `isLoading`, and `error` to their initial empty states), thereby removing the message from the UI.

This approach decouples the lexicon feature from the chat history, preventing the explanation from being persisted or sent back to the LLM as context, as per the original requirement.

By centralizing the event listeners, you can avoid duplicating the logic in multiple components and provide a consistent user experience across the application.
