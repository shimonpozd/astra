import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
// Simple toast replacement
const toast = {
  success: (message: string) => console.log('Success:', message),
  error: (message: string) => console.error('Error:', message),
};

// Deep merge utility
const isObject = (item: any): item is Record<string, any> => {
  return (item && typeof item === 'object' && !Array.isArray(item));
};

const deepMerge = (target: any, ...sources: any[]): any => {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
};

const flattenObject = (obj: any, prefix = ''): any => {
  const flattened: any = {};
  for (const key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      Object.assign(flattened, flattenObject(obj[key], prefix + key + '.'));
    } else {
      flattened[prefix + key] = obj[key];
    }
  }
  return flattened;
};

interface ConfigData {
  llm?: {
    provider?: string;
    model?: string;
    parameters?: {
      temperature?: number;
      top_p?: number;
    };
    api?: {
      [key: string]: any;
    };
    overrides?: {
      [key: string]: string;
    };
  };
  voice?: {
    tts?: {
      provider?: string;
      [key: string]: any;
    };
    stt?: {
      provider?: string;
      [key: string]: any;
    };
  };
  memory?: {
    provider?: string;
    dimension?: number;
    threshold?: number;
    max_results?: number;
    qdrant?: {
      url?: string;
      api_key?: string;
    };
    pinecone?: {
      api_key?: string;
      index?: string;
    };
    stm?: {
      ttl_seconds?: number;
      trigger_messages?: number;
      trigger_tokens?: number;
    };
    [key: string]: any;
  };
  stm?: {
    enabled?: boolean;
    ttl_sec?: number;
    trigger?: {
      msgs_high?: number;
      msgs_low?: number;
      tokens_high?: number;
      tokens_low?: number;
      cooldown_sec?: number;
    };
    slots?: {
      summary_max_items?: number;
      facts_max_items?: number;
      facts_hamm_thresh?: number;
      open_loops_max_items?: number;
      refs_max_items?: number;
    };
    decay?: {
      half_life_min?: number;
    };
    inject?: {
      top_facts?: number;
      top_open_loops?: number;
      top_refs?: number;
      include_when_empty?: boolean;
    };
  };
  research?: {
    max_depth?: number;
    iterations?: {
      min?: number;
      max?: number;
    };
  };
  actions?: {
    translation?: {
      on_demand_quality?: string;
    };
    context?: {
      study_mode_context?: string;
    };
  };
  services?: {
    brain?: {
      port?: number;
      admin_token?: string;
      cors_origins?: string;
      rate_limiting?: {
        enabled?: boolean;
        default_limit?: number;
        window_seconds?: number;
        llm_limit?: number;
      };
      sefaria?: {
        api_url?: string;
        api_key?: string;
        cache_ttl_seconds?: number;
      };
    };
    [key: string]: any;
  };
  [key: string]: any;
}

const GeneralSettings: React.FC = () => {
  const [config, setConfig] = useState<ConfigData>({
    llm: {
      provider: 'openrouter',
      model: 'google/gemini-flash-1.5',
      parameters: {
        temperature: 0.3,
        top_p: 0.9
      }
    },
    voice: {
      tts: {
        provider: 'xtts'
      },
      stt: {
        provider: 'whisper'
      }
    },
    research: {
      max_depth: 3,
      iterations: {
        min: 1,
        max: 5
      }
    },
    memory: {
      provider: 'qdrant',
      dimension: 768,
      threshold: 0.8,
      max_results: 10
    },
    actions: {
      translation: {
        on_demand_quality: 'high'
      },
      context: {
        study_mode_context: 'english_only'
      }
    }
  });
  const [originalConfig, setOriginalConfig] = useState<ConfigData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("llm");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/admin/config', {
        headers: {
          'X-Admin-Token': 'super-secret-token'
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Create a deep copy of the default config to avoid mutation
        const newConfig = JSON.parse(JSON.stringify(config));
        // Deep merge the fetched data into the new config object
        const mergedConfig = deepMerge(newConfig, data);
        setConfig(mergedConfig);
        setOriginalConfig(JSON.parse(JSON.stringify(mergedConfig)));
      } else {
        // Use default config if API fails
        setOriginalConfig(JSON.parse(JSON.stringify(config)));
        toast.error('Failed to load configuration, using defaults');
      }
    } catch (error) {
      // Use default config if API fails
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      toast.error('Error loading configuration, using defaults');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const changes = getConfigChanges(originalConfig, config);

      const response = await fetch('/admin/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': 'super-secret-token'
        },
        body: JSON.stringify(changes),
      });

      if (response.ok) {
        const updatedConfig = await response.json();
        setConfig(updatedConfig);
        setOriginalConfig(JSON.parse(JSON.stringify(updatedConfig)));
        toast.success('Settings saved successfully');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const getConfigChanges = (original: ConfigData, current: ConfigData): Partial<ConfigData> => {

    const compareObjects = (orig: any, curr: any, path: string[] = []): any => {
      if (typeof orig !== 'object' || typeof curr !== 'object' || orig === null || curr === null) {
        return JSON.stringify(orig) !== JSON.stringify(curr) ? curr : undefined;
      }

      const result: any = {};
      const allKeys = new Set([...Object.keys(orig || {}), ...Object.keys(curr || {})]);

      for (const key of allKeys) {
        const newPath = [...path, key];
        const origVal = orig?.[key];
        const currVal = curr?.[key];

        if (origVal === undefined && currVal !== undefined) {
          result[key] = currVal;
        } else if (origVal !== undefined && currVal === undefined) {
          result[key] = currVal;
        } else {
          const diff = compareObjects(origVal, currVal, newPath);
          if (diff !== undefined) {
            result[key] = diff;
          }
        }
      }

      return Object.keys(result).length > 0 ? result : undefined;
    };

    return compareObjects(original, current) || {};
  };

  const updateConfig = (path: string[], value: any) => {
    setConfig(prev => {
      const newConfig = JSON.parse(JSON.stringify(prev));
      let current = newConfig;
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) current[path[i]] = {};
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newConfig;
    });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">General Settings</h1>
          <p className="text-muted-foreground">Configure application settings</p>
        </div>
        <Button onClick={saveConfig} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="llm">LLM</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="stm">STM</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="actions">Actions & Context</TabsTrigger>
          <TabsTrigger value="brain">Brain</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>

        <TabsContent value="llm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Language Model Settings</CardTitle>
              <CardDescription>Configure the LLM provider and parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="llm-provider">Provider</Label>
                  <Select
                    value={config.llm?.provider || ''}
                    onValueChange={(value) => updateConfig(['llm', 'provider'], value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llm-model">Model</Label>
                  <Input
                    id="llm-model"
                    value={config.llm?.model || ''}
                    onChange={(e) => updateConfig(['llm', 'model'], e.target.value)}
                    placeholder="e.g., gpt-4, claude-3-sonnet"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.llm?.parameters?.temperature || ''}
                    onChange={(e) => updateConfig(['llm', 'parameters', 'temperature'], parseFloat(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="top-p">Top P</Label>
                  <Input
                    id="top-p"
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.llm?.parameters?.top_p || ''}
                    onChange={(e) => updateConfig(['llm', 'parameters', 'top_p'], parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {/* API Settings Subsection */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">API Settings</h4>
                <div className="space-y-3">
                  {config.llm?.provider === 'openrouter' && (
                    <div className="space-y-2">
                      <Label htmlFor="openrouter-api-key">OpenRouter API Key</Label>
                      <Input
                        id="openrouter-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['llm', 'api', 'openrouter', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.llm?.api?.openrouter?.api_key ? '****' + config.llm.api.openrouter.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                  )}
                  {config.llm?.provider === 'openai' && (
                    <div className="space-y-2">
                      <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                      <Input
                        id="openai-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['llm', 'api', 'openai', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.llm?.api?.openai?.api_key ? '****' + config.llm.api.openai.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                  )}
                  {config.llm?.provider === 'anthropic' && (
                    <div className="space-y-2">
                      <Label htmlFor="anthropic-api-key">Anthropic API Key</Label>
                      <Input
                        id="anthropic-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['llm', 'api', 'anthropic', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.llm?.api?.anthropic?.api_key ? '****' + config.llm.api.anthropic.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Model Overrides Subsection */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Model Overrides for Tasks</h4>
                <div className="grid grid-cols-2 gap-4">
                  {['chat', 'drafter', 'critic', 'meta_reasoner', 'curator', 'summarizer', 'translator', 'lexicon', 'speechify', 'planner'].map((task) => (
                    <div className="space-y-2" key={task}>
                      <Label htmlFor={`override-${task}`} className="capitalize">{task} Model</Label>
                      <Input
                        id={`override-${task}`}
                        value={config.llm?.overrides?.[task] || ''}
                        onChange={(e) => updateConfig(['llm', 'overrides', task], e.target.value)}
                        placeholder={`Default: ${config.llm?.model}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Voice Settings</CardTitle>
              <CardDescription>Configure text-to-speech and speech-to-text providers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tts-provider">TTS Provider</Label>
                  <Select
                    value={config.voice?.tts?.provider || ''}
                    onValueChange={(value) => updateConfig(['voice', 'tts', 'provider'], value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select TTS provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xtts">XTTS</SelectItem>
                      <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                      <SelectItem value="openai">OpenAI TTS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stt-provider">STT Provider</Label>
                  <Select
                    value={config.voice?.stt?.provider || ''}
                    onValueChange={(value) => updateConfig(['voice', 'stt', 'provider'], value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select STT provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whisper">Whisper</SelectItem>
                      <SelectItem value="deepgram">Deepgram</SelectItem>
                      <SelectItem value="openai">OpenAI Whisper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Provider-Specific Settings */}
              <div className="border-t pt-4 space-y-4">
                {config.voice?.tts?.provider === 'xtts' && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">XTTS Settings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="xtts-api-url">API URL</Label>
                        <Input
                          id="xtts-api-url"
                          value={config.voice?.tts?.api_url || ''}
                          onChange={(e) => updateConfig(['voice', 'tts', 'api_url'], e.target.value)}
                          placeholder="http://localhost:8000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="xtts-model">Model</Label>
                        <Input
                          id="xtts-model"
                          value={config.voice?.tts?.model || ''}
                          onChange={(e) => updateConfig(['voice', 'tts', 'model'], e.target.value)}
                          placeholder="tts_models/multilingual/multi-dataset/xtts_v2"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {config.voice?.tts?.provider === 'elevenlabs' && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">ElevenLabs Settings</h4>
                    <div className="space-y-2">
                      <Label htmlFor="elevenlabs-api-key">API Key</Label>
                      <Input
                        id="elevenlabs-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['voice', 'tts', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.voice?.tts?.api_key ? '****' + config.voice.tts.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                  </div>
                )}

                {config.voice?.stt?.provider === 'deepgram' && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Deepgram Settings</h4>
                    <div className="space-y-2">
                      <Label htmlFor="deepgram-api-key">API Key</Label>
                      <Input
                        id="deepgram-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['voice', 'stt', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.voice?.stt?.api_key ? '****' + config.voice.stt.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memory Settings</CardTitle>
              <CardDescription>Configure memory and knowledge base parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="memory-provider">Memory Provider</Label>
                  <Select
                    value={config.memory?.provider || ''}
                    onValueChange={(value) => updateConfig(['memory', 'provider'], value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select memory provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qdrant">Qdrant</SelectItem>
                      <SelectItem value="chromadb">ChromaDB</SelectItem>
                      <SelectItem value="pinecone">Pinecone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memory-dimension">Embedding Dimension</Label>
                  <Input
                    id="memory-dimension"
                    type="number"
                    min="128"
                    max="4096"
                    value={config.memory?.dimension || ''}
                    onChange={(e) => updateConfig(['memory', 'dimension'], parseInt(e.target.value))}
                    placeholder="768"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="memory-threshold">Similarity Threshold</Label>
                  <Input
                    id="memory-threshold"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={config.memory?.threshold || ''}
                    onChange={(e) => updateConfig(['memory', 'threshold'], parseFloat(e.target.value))}
                    placeholder="0.8"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memory-max-results">Max Results</Label>
                  <Input
                    id="memory-max-results"
                    type="number"
                    min="1"
                    max="50"
                    value={config.memory?.max_results || ''}
                    onChange={(e) => updateConfig(['memory', 'max_results'], parseInt(e.target.value))}
                    placeholder="10"
                  />
                </div>
              </div>

              {/* Embeddings Subsection */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-medium">Embeddings Settings</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="embedding-provider">Provider</Label>
                    <Select
                      value={config.memory?.embeddings?.provider || ''}
                      onValueChange={(value) => updateConfig(['memory', 'embeddings', 'provider'], value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="huggingface">HuggingFace</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="embedding-model">Model Name</Label>
                    <Input
                      id="embedding-model"
                      value={config.memory?.embeddings?.model || ''}
                      onChange={(e) => updateConfig(['memory', 'embeddings', 'model'], e.target.value)}
                      placeholder="e.g., text-embedding-ada-002"
                    />
                  </div>
                </div>
              </div>

              {/* Provider-Specific Memory Settings */}
              {config.memory?.provider === 'qdrant' && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-medium">Qdrant Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="qdrant-url">Qdrant URL</Label>
                      <Input
                        id="qdrant-url"
                        value={config.memory?.qdrant?.url || ''}
                        onChange={(e) => updateConfig(['memory', 'qdrant', 'url'], e.target.value)}
                        placeholder="http://localhost:6333"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qdrant-api-key">API Key</Label>
                      <Input
                        id="qdrant-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['memory', 'qdrant', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.memory?.qdrant?.api_key ? '****' + config.memory.qdrant.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {config.memory?.provider === 'pinecone' && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-medium">Pinecone Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pinecone-api-key">API Key</Label>
                      <Input
                        id="pinecone-api-key"
                        type="password"
                        placeholder="Enter new API key to update"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateConfig(['memory', 'pinecone', 'api_key'], e.target.value);
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current: {config.memory?.pinecone?.api_key ? '****' + config.memory.pinecone.api_key.slice(-4) : 'Not set'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pinecone-index">Index Name</Label>
                      <Input
                        id="pinecone-index"
                        value={config.memory?.pinecone?.index || ''}
                        onChange={(e) => updateConfig(['memory', 'pinecone', 'index'], e.target.value)}
                        placeholder="astra-memory"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STM (Short-Term Memory) Settings */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-medium">Short-Term Memory (STM) Settings</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stm-ttl">TTL (seconds)</Label>
                    <Input
                      id="stm-ttl"
                      type="number"
                      min="3600"
                      max="604800"
                      value={config.memory?.stm?.ttl_seconds || ''}
                      onChange={(e) => updateConfig(['memory', 'stm', 'ttl_seconds'], parseInt(e.target.value))}
                      placeholder="86400"
                    />
                    <p className="text-xs text-muted-foreground">
                      How long to keep STM data (1 hour to 1 week)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-trigger-messages">Trigger Messages</Label>
                    <Input
                      id="stm-trigger-messages"
                      type="number"
                      min="1"
                      max="50"
                      value={config.memory?.stm?.trigger_messages || ''}
                      onChange={(e) => updateConfig(['memory', 'stm', 'trigger_messages'], parseInt(e.target.value))}
                      placeholder="8"
                    />
                    <p className="text-xs text-muted-foreground">
                      Update STM after this many messages
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-trigger-tokens">Trigger Tokens</Label>
                    <Input
                      id="stm-trigger-tokens"
                      type="number"
                      min="500"
                      max="10000"
                      value={config.memory?.stm?.trigger_tokens || ''}
                      onChange={(e) => updateConfig(['memory', 'stm', 'trigger_tokens'], parseInt(e.target.value))}
                      placeholder="2000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Update STM after this many tokens
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Short-Term Memory (STM) Settings</CardTitle>
              <CardDescription>Configure enhanced STM with structured slots and semantic deduplication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Global STM Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Global Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stm-enabled">STM Enabled</Label>
                    <Select
                      value={config.stm?.enabled ? 'true' : 'false'}
                      onValueChange={(value) => updateConfig(['stm', 'enabled'], value === 'true')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Enabled</SelectItem>
                        <SelectItem value="false">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-ttl">TTL (seconds)</Label>
                    <Input
                      id="stm-ttl"
                      type="number"
                      min="60"
                      max="172800"
                      value={config.stm?.ttl_sec || ''}
                      onChange={(e) => updateConfig(['stm', 'ttl_sec'], parseInt(e.target.value))}
                      placeholder="86400"
                    />
                    <p className="text-xs text-muted-foreground">
                      Time to live for STM records (60-172800)
                    </p>
                  </div>
                </div>
              </div>

              {/* Trigger Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Update Triggers</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stm-msgs-high">Messages High Threshold</Label>
                    <Input
                      id="stm-msgs-high"
                      type="number"
                      min="4"
                      max="50"
                      value={config.stm?.trigger?.msgs_high || ''}
                      onChange={(e) => updateConfig(['stm', 'trigger', 'msgs_high'], parseInt(e.target.value))}
                      placeholder="10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Upper message count threshold (4-50)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-msgs-low">Messages Low Threshold</Label>
                    <Input
                      id="stm-msgs-low"
                      type="number"
                      min="2"
                      max="49"
                      value={config.stm?.trigger?.msgs_low || ''}
                      onChange={(e) => updateConfig(['stm', 'trigger', 'msgs_low'], parseInt(e.target.value))}
                      placeholder="6"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower message count threshold (2-49)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-tokens-high">Tokens High Threshold</Label>
                    <Input
                      id="stm-tokens-high"
                      type="number"
                      min="500"
                      max="6000"
                      value={config.stm?.trigger?.tokens_high || ''}
                      onChange={(e) => updateConfig(['stm', 'trigger', 'tokens_high'], parseInt(e.target.value))}
                      placeholder="2500"
                    />
                    <p className="text-xs text-muted-foreground">
                      Upper token count threshold (500-6000)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-tokens-low">Tokens Low Threshold</Label>
                    <Input
                      id="stm-tokens-low"
                      type="number"
                      min="250"
                      max="5000"
                      value={config.stm?.trigger?.tokens_low || ''}
                      onChange={(e) => updateConfig(['stm', 'trigger', 'tokens_low'], parseInt(e.target.value))}
                      placeholder="1500"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower token count threshold (250-5000)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-cooldown">Cooldown (seconds)</Label>
                    <Input
                      id="stm-cooldown"
                      type="number"
                      min="5"
                      max="300"
                      value={config.stm?.trigger?.cooldown_sec || ''}
                      onChange={(e) => updateConfig(['stm', 'trigger', 'cooldown_sec'], parseInt(e.target.value))}
                      placeholder="30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum time between updates (5-300)
                    </p>
                  </div>
                </div>
              </div>

              {/* Slot Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Memory Slots</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stm-summary-max">Summary Max Items</Label>
                    <Input
                      id="stm-summary-max"
                      type="number"
                      min="3"
                      max="12"
                      value={config.stm?.slots?.summary_max_items || ''}
                      onChange={(e) => updateConfig(['stm', 'slots', 'summary_max_items'], parseInt(e.target.value))}
                      placeholder="8"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum summary bullet points (3-12)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-facts-max">Facts Max Items</Label>
                    <Input
                      id="stm-facts-max"
                      type="number"
                      min="10"
                      max="200"
                      value={config.stm?.slots?.facts_max_items || ''}
                      onChange={(e) => updateConfig(['stm', 'slots', 'facts_max_items'], parseInt(e.target.value))}
                      placeholder="50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum facts in memory (10-200)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-hamm-thresh">Hamming Threshold</Label>
                    <Input
                      id="stm-hamm-thresh"
                      type="number"
                      min="1"
                      max="16"
                      value={config.stm?.slots?.facts_hamm_thresh || ''}
                      onChange={(e) => updateConfig(['stm', 'slots', 'facts_hamm_thresh'], parseInt(e.target.value))}
                      placeholder="6"
                    />
                    <p className="text-xs text-muted-foreground">
                      SimHash deduplication threshold (1-16)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-loops-max">Open Loops Max Items</Label>
                    <Input
                      id="stm-loops-max"
                      type="number"
                      min="1"
                      max="30"
                      value={config.stm?.slots?.open_loops_max_items || ''}
                      onChange={(e) => updateConfig(['stm', 'slots', 'open_loops_max_items'], parseInt(e.target.value))}
                      placeholder="10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum open questions/tasks (1-30)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-refs-max">References Max Items</Label>
                    <Input
                      id="stm-refs-max"
                      type="number"
                      min="1"
                      max="30"
                      value={config.stm?.slots?.refs_max_items || ''}
                      onChange={(e) => updateConfig(['stm', 'slots', 'refs_max_items'], parseInt(e.target.value))}
                      placeholder="10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum Sefaria references (1-30)
                    </p>
                  </div>
                </div>
              </div>

              {/* Decay Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Memory Decay</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stm-half-life">Half-Life (minutes)</Label>
                    <Input
                      id="stm-half-life"
                      type="number"
                      min="10"
                      max="1440"
                      value={config.stm?.decay?.half_life_min || ''}
                      onChange={(e) => updateConfig(['stm', 'decay', 'half_life_min'], parseInt(e.target.value))}
                      placeholder="240"
                    />
                    <p className="text-xs text-muted-foreground">
                      Time for fact scores to decay by half (10-1440 minutes)
                    </p>
                  </div>
                </div>
              </div>

              {/* Injection Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Prompt Injection</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stm-inject-facts">Top Facts to Inject</Label>
                    <Input
                      id="stm-inject-facts"
                      type="number"
                      min="0"
                      max="10"
                      value={config.stm?.inject?.top_facts || ''}
                      onChange={(e) => updateConfig(['stm', 'inject', 'top_facts'], parseInt(e.target.value))}
                      placeholder="3"
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of top facts to include in prompts (0-10)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-inject-loops">Top Open Loops to Inject</Label>
                    <Input
                      id="stm-inject-loops"
                      type="number"
                      min="0"
                      max="5"
                      value={config.stm?.inject?.top_open_loops || ''}
                      onChange={(e) => updateConfig(['stm', 'inject', 'top_open_loops'], parseInt(e.target.value))}
                      placeholder="2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of open questions to include (0-5)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-inject-refs">Top References to Inject</Label>
                    <Input
                      id="stm-inject-refs"
                      type="number"
                      min="0"
                      max="5"
                      value={config.stm?.inject?.top_refs || ''}
                      onChange={(e) => updateConfig(['stm', 'inject', 'top_refs'], parseInt(e.target.value))}
                      placeholder="3"
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of Sefaria references to include (0-5)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stm-include-empty">Include When Empty</Label>
                    <Select
                      value={config.stm?.inject?.include_when_empty ? 'true' : 'false'}
                      onValueChange={(value) => updateConfig(['stm', 'inject', 'include_when_empty'], value === 'true')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Include STM context even when empty
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="research" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Research Settings</CardTitle>
              <CardDescription>Configure research depth and iteration parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-depth">Max Depth</Label>
                  <Input
                    id="max-depth"
                    type="number"
                    min="1"
                    max="10"
                    value={config.research?.max_depth || ''}
                    onChange={(e) => updateConfig(['research', 'max_depth'], parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-iterations">Min Iterations</Label>
                  <Input
                    id="min-iterations"
                    type="number"
                    min="1"
                    value={config.research?.iterations?.min || ''}
                    onChange={(e) => updateConfig(['research', 'iterations', 'min'], parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-iterations">Max Iterations</Label>
                  <Input
                    id="max-iterations"
                    type="number"
                    min="1"
                    value={config.research?.iterations?.max || ''}
                    onChange={(e) => updateConfig(['research', 'iterations', 'max'], parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions & Context Settings</CardTitle>
              <CardDescription>Configure settings for translation and study mode context</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="on-demand-translation-quality">On-Demand Translation Quality</Label>
                <Select
                  value={config.actions?.translation?.on_demand_quality || ''}
                  onValueChange={(value) => updateConfig(['actions', 'translation', 'on_demand_quality'], value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select quality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls the context for the on-demand 'Translate' button. 'High' sends both Hebrew and English for better context, while 'Fast' sends only English.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="study-mode-context">Study Mode Context</Label>
                <Select
                  value={config.actions?.context?.study_mode_context || ''}
                  onValueChange={(value) => updateConfig(['actions', 'context', 'study_mode_context'], value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hebrew_and_english">Hebrew and English</SelectItem>
                    <SelectItem value="english_only">English Only</SelectItem>
                    <SelectItem value="hebrew_only">Hebrew Only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines what text is sent to the LLM when asking questions in Study Mode.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brain" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Brain Service Settings</CardTitle>
              <CardDescription>Configure the Brain service parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brain-port">Port</Label>
                <Input
                  id="brain-port"
                  type="number"
                  value={config.services?.brain?.port || 7030}
                  onChange={(e) => updateConfig(['services', 'brain', 'port'], parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Port number for the Brain service
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-token">Admin Token</Label>
                <Input
                  id="admin-token"
                  type="password"
                  value={config.services?.brain?.admin_token || ''}
                  onChange={(e) => updateConfig(['services', 'brain', 'admin_token'], e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Secret token for admin API access
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cors-origins">CORS Origins</Label>
                <Input
                  id="cors-origins"
                  value={config.services?.brain?.cors_origins || ''}
                  onChange={(e) => updateConfig(['services', 'brain', 'cors_origins'], e.target.value)}
                  placeholder="http://localhost:5173,http://localhost:3000"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of allowed origins for CORS
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
              <CardDescription>Configure request rate limiting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="rate-limit-enabled"
                  checked={config.services?.brain?.rate_limiting?.enabled || false}
                  onChange={(e) => updateConfig(['services', 'brain', 'rate_limiting', 'enabled'], e.target.checked)}
                />
                <Label htmlFor="rate-limit-enabled">
                  Enable Rate Limiting
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-limit">Default Limit (requests per window)</Label>
                <Input
                  id="default-limit"
                  type="number"
                  value={config.services?.brain?.rate_limiting?.default_limit || 10}
                  onChange={(e) => updateConfig(['services', 'brain', 'rate_limiting', 'default_limit'], parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="window-seconds">Window (seconds)</Label>
                <Input
                  id="window-seconds"
                  type="number"
                  value={config.services?.brain?.rate_limiting?.window_seconds || 60}
                  onChange={(e) => updateConfig(['services', 'brain', 'rate_limiting', 'window_seconds'], parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="llm-limit">LLM Endpoint Limit (requests per window)</Label>
                <Input
                  id="llm-limit"
                  type="number"
                  value={config.services?.brain?.rate_limiting?.llm_limit || 5}
                  onChange={(e) => updateConfig(['services', 'brain', 'rate_limiting', 'llm_limit'], parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Stricter limit for LLM endpoints (chat/stream)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sefaria Integration</CardTitle>
              <CardDescription>Configure Sefaria API settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sefaria-api-url">API URL</Label>
                <Input
                  id="sefaria-api-url"
                  value={config.services?.brain?.sefaria?.api_url || ''}
                  onChange={(e) => updateConfig(['services', 'brain', 'sefaria', 'api_url'], e.target.value)}
                  placeholder="http://localhost:8000/api/"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sefaria-api-key">API Key</Label>
                <Input
                  id="sefaria-api-key"
                  type="password"
                  value={config.services?.brain?.sefaria?.api_key || ''}
                  onChange={(e) => updateConfig(['services', 'brain', 'sefaria', 'api_key'], e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sefaria-cache-ttl">Cache TTL (seconds)</Label>
                <Input
                  id="sefaria-cache-ttl"
                  type="number"
                  value={config.services?.brain?.sefaria?.cache_ttl_seconds || 60}
                  onChange={(e) => updateConfig(['services', 'brain', 'sefaria', 'cache_ttl_seconds'], parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  How long to cache Sefaria API responses
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="other" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Other Settings</CardTitle>
              <CardDescription>Additional configuration options</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Additional settings will be added here as needed.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GeneralSettings;