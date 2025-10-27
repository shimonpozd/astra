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

---

## Scenario 3: Adding a New Model Override for Study Mode

The system supports different LLM models for different tasks. For example, you might want to use a different model specifically for Study Mode interactions.

### Step 1: Add the Override to the Backend

1. **Open `config/defaults.toml`**.
2. Add your new model override under the `[llm.overrides]` section.

    ```toml
    [llm.overrides]
    # ... existing overrides ...
    study = "deepseek/deepseek-chat-v3.1:free"
    ```

### Step 2: Add the Override to the Frontend UI

1. **Open `astra-web-client/src/pages/admin/GeneralSettings.tsx`**.

2. **Find the Model Overrides section** (around line 496) where the task overrides are defined.

3. **Add your new task to the array** of tasks that get override inputs:

    ```tsx
    {['chat', 'drafter', 'critic', 'meta_reasoner', 'curator', 'summarizer', 'translator', 'lexicon', 'speechify', 'planner', 'summary', 'study'].map((task) => (
      <div className="space-y-2" key={task}>
        <Label htmlFor={`override-${task}`} className="capitalize">{task} Model</Label>
        <Input
          id={`override-${task}`}
          value={config.llm?.overrides?.[task] || ''}
          onChange={(e) => updateConfig(['llm', 'overrides', task], e.target.value)}
          placeholder="Leave empty to use default model"
        />
      </div>
    ))}
    ```

4. **Update the ConfigData interface** to include the new override:

    ```typescript
    interface ConfigData {
      llm?: {
        // ... other llm properties
        overrides?: {
          [key: string]: string;
          study?: string; // Add this line
        };
      };
    }
    ```

### Step 3: Use the Override in Your Backend Code

In your Python code, the LLM service will automatically use the study-specific model when the task is identified as "study". The override system is handled by the `LLMService` class, which checks for task-specific overrides before falling back to the default model.

**Example usage in study-related endpoints:**
```python
# The LLM service will automatically use the 'study' override model
# when processing study mode requests
response = await llm_service.generate_response(
    messages=messages,
    task="study"  # This will trigger the study model override
)
```

This allows you to use a specialized model for Study Mode that might be better suited for Talmudic text analysis, while using a different model for general chat interactions.

---

## Scenario 4: Adding ElevenLabs TTS Settings (Provider, Model, Voice)

This section shows how to expose ElevenLabs voice/model settings in the Admin panel and how the frontend can synthesize audio using `@elevenlabs/elevenlabs-js`.

### Step 1: Ensure Backend Config Keys Exist

Check `config/defaults.toml` already has a TTS section (it does by default):

```toml
[voice.tts]
provider = "xtts" # can be "elevenlabs", "xtts", or "openai"

[voice.tts.elevenlabs]
api_key = "${ELEVENLABS_API_KEY}"
voice_id = "Rachel"
# Optional model id for ElevenLabs
model_id = "eleven_multilingual_v2"
```

You can override these in your environment (env var `ELEVENLABS_API_KEY`) or via Admin UI (next step).

### Step 2: Expose Settings in Admin Panel UI

Open `astra-web-client/src/pages/admin/GeneralSettings.tsx` and, in the "Voice / TTS" section, make sure the provider selector includes "ElevenLabs" (it already does). Add inputs for ElevenLabs API Key, Voice ID, and Model ID inside the provider-specific block:

```tsx
{config.voice?.tts?.provider === 'elevenlabs' && (
  <div className="space-y-3">
    <h4 className="text-sm font-medium">ElevenLabs Settings</h4>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="el-api-key">API Key</Label>
        <Input
          id="el-api-key"
          type="password"
          value={config.voice?.tts?.api_key || ''}
          onChange={(e) => updateConfig(['voice', 'tts', 'api_key'], e.target.value)}
          placeholder="ELEVENLABS_API_KEY"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="el-voice-id">Voice ID</Label>
        <Input
          id="el-voice-id"
          value={config.voice?.tts?.voice_id || ''}
          onChange={(e) => updateConfig(['voice', 'tts', 'voice_id'], e.target.value)}
          placeholder="JBFqnCBsd6RMkjVDRZzb"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="el-model-id">Model ID</Label>
        <Input
          id="el-model-id"
          value={config.voice?.tts?.model_id || ''}
          onChange={(e) => updateConfig(['voice', 'tts', 'model_id'], e.target.value)}
          placeholder="eleven_multilingual_v2"
        />
      </div>
    </div>
  </div>
)}
```

The existing `updateConfig` mechanism will persist these values through `/api/admin/config`.

### Step 3: Use ElevenLabs on the Frontend (Optional Direct Usage)

If you want direct, library-based playback in the browser (instead of routing through your TTS service), you can use `@elevenlabs/elevenlabs-js`:

```ts
import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';

const elevenlabs = new ElevenLabsClient({
  apiKey: '<YOUR_API_KEY>', // or from config
});

const audio = await elevenlabs.textToSpeech.convert(
  'JBFqnCBsd6RMkjVDRZzb', // voice_id
  {
    text: 'The first move is what sets everything in motion.',
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
  }
);

await play(audio);
```

Notes:
- Prefer using your existing `useTTS`/`ttsService.ts` abstraction for consistent provider switching. The Admin settings above will flow into that service.
- If using the library directly, ensure the API key is securely provided (do not hardcode in production).

---

## Scenario 5: Adding Yandex SpeechKit TTS Settings

This section shows how to expose Yandex SpeechKit settings in the Admin panel and how the backend uses them.

### Step 1: Ensure Backend Config Keys Exist

Add (or verify) keys under `voice.tts` in `config/defaults.toml`:

```toml
[voice.tts]
provider = "yandex" # can be: xtts, elevenlabs, yandex, orpheus

[voice.tts.yandex]
api_key = "${YANDEX_API_KEY}"
folder_id = "${YANDEX_FOLDER_ID}"
voice = "oksana"            # e.g., oksana, jane, zahar, ermil
format = "oggopus"          # oggopus | mp3 | wav
sample_rate = "48000"       # 48000 for oggopus recommended
```

The TTS service (`tts/main.py`) reads these via `audio/settings.py` as `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`, `YANDEX_VOICE`, `YANDEX_FORMAT`, `YANDEX_SAMPLE_RATE`.

### Step 2: Expose Settings in Admin Panel UI

Open `astra-web-client/src/pages/admin/GeneralSettings.tsx` and, in the "Voice / TTS" section, add a provider option and provider-specific inputs:

```tsx
{/* Provider selector should include 'yandex' */}

{config.voice?.tts?.provider === 'yandex' && (
  <div className="space-y-3">
    <h4 className="text-sm font-medium">Yandex SpeechKit</h4>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="yandex-api-key">API Key</Label>
        <Input
          id="yandex-api-key"
          type="password"
          placeholder="Enter new API key"
          onChange={(e) => e.target.value && updateConfig(['voice', 'tts', 'yandex_api_key'], e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Current: {config.voice?.tts?.yandex_api_key ? '****' + String(config.voice.tts.yandex_api_key).slice(-4) : 'Not set'}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="yandex-folder-id">Folder ID</Label>
        <Input
          id="yandex-folder-id"
          value={config.voice?.tts?.yandex_folder_id || ''}
          onChange={(e) => updateConfig(['voice', 'tts', 'yandex_folder_id'], e.target.value)}
          placeholder="b1g1234567890abcdef"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="yandex-voice">Voice</Label>
        <Input
          id="yandex-voice"
          value={config.voice?.tts?.yandex_voice || 'oksana'}
          onChange={(e) => updateConfig(['voice', 'tts', 'yandex_voice'], e.target.value)}
          placeholder="oksana"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="yandex-format">Format</Label>
        <Select
          value={config.voice?.tts?.yandex_format || 'oggopus'}
          onValueChange={(value) => updateConfig(['voice', 'tts', 'yandex_format'], value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select output format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oggopus">OGG OPUS</SelectItem>
            <SelectItem value="mp3">MP3</SelectItem>
            <SelectItem value="wav">WAV (LINEAR16)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="yandex-sample-rate">Sample Rate</Label>
        <Input
          id="yandex-sample-rate"
          value={config.voice?.tts?.yandex_sample_rate || '48000'}
          onChange={(e) => updateConfig(['voice', 'tts', 'yandex_sample_rate'], e.target.value)}
          placeholder="48000"
        />
      </div>
    </div>
  </div>
)}
```

These settings will be available via `/api/admin/config` and used by the TTS service when `voice.tts.provider` is set to `yandex`.

### Step 3: Behavior

- TTS streaming returns `audio/ogg` when format is `oggopus`, otherwise the service responds with `audio/wav` (or `audio/mpeg` for other providers where applicable).
- Frontend continues to use the existing `/api/tts/synthesize` endpoint via `useTTS`; no changes required besides selecting the provider and filling the settings.
