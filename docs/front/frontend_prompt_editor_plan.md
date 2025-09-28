# Frontend Plan: Prompt Editor

## 1. High-Level Goal

The objective is to create a new section in the web admin panel that allows users to easily view, edit, and manage all system prompts used by the backend.

## 2. Backend API Endpoints

The backend now exposes the following endpoints for prompt management. The base URL for the brain service is assumed to be running on `http://localhost:7030`.

### List All Prompts

- **Endpoint:** `GET /admin/prompts`
- **Method:** `GET`
- **Description:** Retrieves a list of all registered prompts with their metadata.
- **Success Response (200 OK):**
  ```json
  [
    {
      "id": "deep_research.critic",
      "domain": "deep_research",
      "name": "critic",
      "description": "System prompt for the CRITIC agent that reviews research drafts."
    },
    // ... other prompts
  ]
  ```

### Get a Single Prompt's Content

- **Endpoint:** `GET /admin/prompts/{prompt_id}`
- **Example:** `GET /admin/prompts/deep_research.critic`
- **Method:** `GET`
- **Description:** Retrieves the full text content of a single prompt.
- **Success Response (200 OK):**
  ```json
  {
    "id": "deep_research.critic",
    "text": "You are a demanding Torah scholar..."
  }
  ```
- **Error Response (404 Not Found):** If the `prompt_id` does not exist.

### Update a Prompt

- **Endpoint:** `PUT /admin/prompts/{prompt_id}`
- **Example:** `PUT /admin/prompts/deep_research.critic`
- **Method:** `PUT`
- **Description:** Updates the text for a specific prompt.
- **Request Body:**
  ```json
  {
    "text": "The new prompt content goes here..."
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "status": "ok"
  }
  ```
- **Error Response (500 Internal Server Error):** If the update fails on the backend.

## 3. UI/UX Requirements

### 3.1. Main Navigation

- A new navigation item, possibly labeled **"Admin"** or **"Settings"**, should be added to the main navigation.
- Under this item, there should be a link to **"Prompts"** which leads to the Prompt List View.

### 3.2. Prompt List View

- **Route:** `/admin/prompts` (or similar)
- **Functionality:**
  1. On page load, make a request to `GET /admin/prompts`.
  2. Display the returned prompts in a table or a list.
  3. The table should have the following columns: `ID`, `Domain`, `Name`, and `Description`.
  4. Each row should be clickable and navigate the user to the Prompt Editor View for that specific prompt (e.g., to `/admin/prompts/edit/deep_research.critic`).

### 3.3. Prompt Editor View

- **Route:** `/admin/prompts/edit/{prompt_id}` (e.g., `/admin/prompts/edit/deep_research.critic`)
- **Functionality:**
  1. On page load, extract the `prompt_id` from the URL.
  2. Make a request to `GET /admin/prompts/{prompt_id}` to fetch the prompt's current text.
  3. Display the `id` and `description` of the prompt as read-only text.
  4. Display the `text` of the prompt in a large `<textarea>` element to allow for easy multi-line editing.
  5. Provide a **"Save"** button.
  6. When the "Save" button is clicked, send a `PUT` request to `/admin/prompts/{prompt_id}` with the updated text in the request body.
  7. On successful save, display a success notification (e.g., a toast message saying "Prompt saved successfully!").
  8. On failure, display an error notification.
  9. Consider adding a "Cancel" or "Back" button to return to the list view without saving.

## 4. Styling

- All new components should match the existing visual style and component library of the `astra-web-client` application to ensure a consistent user experience.
