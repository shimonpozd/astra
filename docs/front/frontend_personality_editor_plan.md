# Frontend Plan: Personality Editor

## 1. High-Level Goal

This feature will provide a UI within the admin panel to perform full CRUD (Create, Read, Update, Delete) operations on agent personalities. This will replace the need to manually edit the `personalities.json` file.

## 2. Data Model

A personality object consists of several fields that define its behavior. The core fields are:

- **`id`** (string, required): The unique identifier for the personality (e.g., `rabbi_v2`, `translator`).
- **`description`** (string): A brief, human-readable description of the personality's purpose.
- **`system_prompt`** (string): The main system prompt text that defines the agent's behavior and tone.
- **`use_sefaria_tools`** (boolean): A flag to enable or disable Sefaria-related tools.
- **`flow`** (string): The conversation flow type (e.g., `conversational`, `deep_research`, `talmud_json`).

## 3. Backend API Endpoints

The following endpoints will be created on the backend to manage personalities. The API will handle storing each personality as a separate TOML file in the `prompts/personalities/` directory.

### List All Personalities

- **Endpoint:** `GET /admin/personalities`
- **Description:** Retrieves a list of all available personalities.
- **Success Response (200 OK):**
  ```json
  [
    {
      "id": "default",
      "description": "The default assistant.",
      "flow": "conversational"
    },
    {
      "id": "rabbi",
      "description": "A personality that acts as a Torah scholar.",
      "flow": "deep_research"
    }
  ]
  ```

### Get a Single Personality

- **Endpoint:** `GET /admin/personalities/{id}`
- **Description:** Retrieves the full details for a single personality.
- **Success Response (200 OK):**
  ```json
  {
    "id": "rabbi",
    "description": "A personality that acts as a Torah scholar.",
    "system_prompt": "You are a helpful and knowledgeable Torah scholar...",
    "use_sefaria_tools": true,
    "flow": "deep_research"
  }
  ```

### Create a New Personality

- **Endpoint:** `POST /admin/personalities`
- **Description:** Creates a new personality.
- **Request Body:**
  ```json
  {
    "id": "rabbi_v2",
    "description": "An updated Torah scholar personality.",
    "system_prompt": "You are an even more helpful scholar...",
    "use_sefaria_tools": true,
    "flow": "deep_research"
  }
  ```
- **Success Response (201 Created):** Returns the newly created object.

### Update a Personality

- **Endpoint:** `PUT /admin/personalities/{id}`
- **Description:** Updates an existing personality. The request body should contain all fields.
- **Request Body:** (Same structure as the POST body)
- **Success Response (200 OK):** Returns the updated object.

### Delete a Personality

- **Endpoint:** `DELETE /admin/personalities/{id}`
- **Description:** Deletes a personality.
- **Success Response (204 No Content):**

## 4. UI/UX Requirements

### 4.1. Main Navigation

- The "Admin" / "Settings" menu should contain a link to **"Personalities"**.

### 4.2. Personality List View

- **Route:** `/admin/personalities`
- **Functionality:**
  1. On page load, fetch data from `GET /admin/personalities`.
  2. Display the personalities in a table with columns for `ID` and `Description`.
  3. Include a prominent **"Create New Personality"** button that navigates to the editor view (`/admin/personalities/new`).
  4. Each row in the table should have an **"Edit"** button (navigating to `/admin/personalities/edit/{id}`) and a **"Delete"** button.
  5. Clicking the "Delete" button should trigger a confirmation modal before calling the `DELETE` endpoint.

### 4.3. Personality Create/Edit View

- **Route:** `/admin/personalities/new` for creation, `/admin/personalities/edit/{id}` for editing.
- **Functionality:**
  1. This view will contain a form for all the fields in the personality data model.
  2. For the `/edit/{id}` route, the form should be pre-populated by fetching data from `GET /admin/personalities/{id}`.
  3. **Form Fields:**
     - **ID:** A standard text input. Should be disabled (read-only) when editing an existing personality.
     - **Description:** A standard text input.
     - **System Prompt:** A large `<textarea>` for multi-line text entry.
     - **Use Sefaria Tools:** A checkbox.
     - **Flow:** A dropdown/select menu with the available options (`conversational`, `deep_research`, `talmud_json`, etc.).
  4. A **"Save"** button that triggers the `POST` (for new) or `PUT` (for existing) request.
  5. Display success or error notifications upon saving.
