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
    [key: string]: any;
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
      const response = await fetch('/admin/config');
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="llm">LLM</TabsTrigger>
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="actions">Actions & Context</TabsTrigger>
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