# Frontend Plan: General Settings Editor

## 1. High-Level Goal

To create a comprehensive UI within the admin panel for viewing and editing all general application settings, such as LLM providers, voice settings, and numerical parameters for research. This interface will consume and update the main configuration object managed by the backend.

## 2. API Endpoints

This UI will interact exclusively with the existing `/admin/config` endpoints.

### Fetch All Settings

- **Endpoint:** `GET /admin/config`
- **Description:** Retrieves the entire nested configuration object for the application.
- **Success Response (200 OK):** A JSON object representing the full configuration.
  ```json
  {
    "llm": {
      "provider": "openrouter",
      "model": "google/gemini-flash-1.5",
      "parameters": {
        "temperature": 0.3
      }
    },
    "voice": {
      "tts": {
        "provider": "xtts"
      },
      "stt": {
        "provider": "whisper"
      }
    },
    "research": {
      "max_depth": 3
    }
    // ... and all other settings
  }
  ```

### Update Settings

- **Endpoint:** `PATCH /admin/config`
- **Description:** Updates one or more settings. The request body should be a **partial JSON object** containing only the keys and values that have changed, preserving the nested structure.
- **Example Request Body (if only changing temperature):**
  ```json
  {
    "llm": {
      "parameters": {
        "temperature": 0.5
      }
    }
  }
  ```
- **Example Request Body (if changing multiple settings):**
  ```json
  {
    "llm": {
      "provider": "ollama"
    },
    "voice": {
      "tts": {
        "provider": "elevenlabs"
      }
    }
  }
  ```
- **Success Response (200 OK):** Returns the complete, updated configuration object.

## 3. UI/UX Requirements

### 3.1. Navigation and Layout

- **Route:** `/admin/settings`
- **Navigation:** A link in the main "Admin" menu, labeled **"General Settings"**.
- **Layout:**
  - A primary **"Save Changes"** button should be visible at all times (e.g., in a sticky header or footer).
  - The settings should be organized into a **tabbed interface** to prevent an overwhelmingly long page. The tabs should correspond to the top-level keys in the configuration object (e.g., "LLM", "Voice", "Memory", "Research", "Launcher").

### 3.2. Data Flow

1.  **On Page Load:** Fetch the entire configuration from `GET /admin/config` and use this data to populate the state for all form inputs across all tabs.
2.  **On User Input:** As the user changes values in the form, update a local state object that tracks the changes.
3.  **On Save:** When the "Save Changes" button is clicked:
    a.  Generate a partial JSON object containing only the values that differ from the initially loaded configuration.
    b.  Send this partial object in the body of a `PATCH` request to `/admin/config`.
    c.  On success, display a success notification. The page can either re-fetch the data to confirm the changes or simply update its local state with the response from the PATCH request.
    d.  On failure, display an error notification.

### 3.3. Form Component Specification (by Tab)

This is a suggested breakdown of components for each tab.

#### "LLM" Tab
- **Provider:** A `<select>` dropdown for `llm.provider` with options like `openai`, `openrouter`, `ollama`.
- **Model:** A text input for `llm.model`.
- **Temperature:** A slider or number input for `llm.parameters.temperature` (range 0.0 to 1.0).
- **Top P:** A slider or number input for `llm.parameters.top_p` (range 0.0 to 1.0).
- **API Settings:** A subsection with text inputs for API keys and base URLs (e.g., `llm.api.openrouter.base_url`). **Note:** API keys should be displayed masked (e.g., `****...`) and should only be updated if the user enters a new value.

#### "Voice" Tab
- **TTS Provider:** A `<select>` dropdown for `voice.tts.provider` (`xtts`, `elevenlabs`, etc.).
- **STT Provider:** A `<select>` dropdown for `voice.stt.provider` (`whisper`, `deepgram`, etc.).
- **Provider-Specific Settings:** Nested sections for each provider's settings, e.g., a text input for `voice.tts.xtts.api_url`.

#### "Research" Tab
- **Max Depth:** A number input for `research.max_depth`.
- **Min Iterations:** A number input for `research.iterations.min`.
- **Max Iterations:** A number input for `research.iterations.max`.

#### Other Tabs
- Continue this pattern for other configuration domains like `memory`, `export`, and `launcher`, using the appropriate input types (dropdowns, number inputs, text inputs, checkboxes for booleans) for each setting.
