# How to Extend the Admin Panel

This guide explains how to add new settings and prompts to the system so they can be managed via the web admin panel.

## Scenario 1: Adding a New General Setting

Let's say you want to add a new boolean setting `enable_experimental_feature` under a new `features` section.

### Step 1: Add the Setting to the Backend

1.  **Open `config/defaults.toml`**.
2.  Add your new setting under the desired section. If the section doesn't exist, create it.

    ```toml
    # ... other settings ...

    [features]
    enable_experimental_feature = false
    ```

That's it for the backend. The API endpoints (`GET` and `PATCH` for `/admin/config`) will automatically pick up and handle this new setting.

### Step 2: Add the Setting to the Frontend UI

1.  **Open `astra-web-client/src/pages/admin/GeneralSettings.tsx`**.

2.  **(Optional) Update the `ConfigData` Interface:** For better type safety, add your new field to the `ConfigData` interface at the top of the file.

    ```typescript
    interface ConfigData {
      // ... other types
      features?: {
        enable_experimental_feature?: boolean;
      };
    }
    ```

3.  **Add a New Tab (if needed):** If you created a new top-level section (like `[features]`), you should add a new `TabsTrigger` to the `TabsList`.

    ```tsx
    <TabsList className="grid w-full grid-cols-6"> // Adjust grid-cols
      <TabsTrigger value="llm">LLM</TabsTrigger>
      {/* ... other tabs ... */}
      <TabsTrigger value="features">Features</TabsTrigger>
    </TabsList>
    ```

4.  **Add the UI Control:** Inside the `Tabs` component, create a new `TabsContent` block for your section and add the appropriate input control. For a boolean, a checkbox is suitable.

    ```tsx
    <TabsContent value="features" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Experimental Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enable-experimental-feature"
              checked={config.features?.enable_experimental_feature || false}
              onChange={(e) => updateConfig(['features', 'enable_experimental_feature'], e.target.checked)}
            />
            <Label htmlFor="enable-experimental-feature">
              Enable Experimental Feature
            </Label>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
    ```

The existing `updateConfig` and `saveConfig` functions will automatically handle state changes and API calls.

---

## Scenario 2: Adding a New System Prompt

Let's say you've written a new Python function that needs a system prompt.

### Step 1: Create the Prompt File

1.  Decide on a **domain** for your prompt (e.g., `translator`).
2.  Create a new file in `prompts/defaults/`. For example, `prompts/defaults/translator.toml`.
3.  Add the prompt to this file with a unique **name** (e.g., `system`) and metadata.

    ```toml
    [system]
    id = "translator.system" # The full ID is domain.name
    description = "System prompt for the new translation agent."
    text = """
    You are a helpful translation assistant. Translate the user's text accurately...
    """
    ```

### Step 2: Use the Prompt in Your Backend Code

1.  In the Python file where you need the prompt, import the `get_prompt` function.

    ```python
    from config.prompts import get_prompt
    ```

2.  Call the function with the `id` you defined in the TOML file.

    ```python
    def my_new_translator_function():
        system_prompt = get_prompt("translator.system")
        if not system_prompt:
            # Handle error case where prompt is not found
            logger.error("Translator system prompt not found!")
            return
        
        # ... use the system_prompt ...
    ```

### Step 3: Verify in Frontend

**No action is required on the frontend.** The "Prompts" page in the admin panel automatically fetches the list of all available prompts from the `GET /admin/prompts` endpoint. Your new prompt will appear in the list, ready to be viewed and edited.
