import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { debugLog } from '../../utils/debugLogger';
import { authorizedFetch } from '../../lib/authorizedFetch';

interface Personality {
  id: string;
  description?: string;
  system_prompt?: string | string[];
  use_sefaria_tools?: boolean;
  use_mem0_tool?: boolean;
  use_graph_context?: boolean;
  use_research_memory?: boolean;
  flow?: string;
  language?: string;
  kgraph_collection?: string;
  mem0_collection?: string;
  research_collection?: string;
  per_study_collections?: boolean;
}

const PersonalityEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<Partial<Personality>>({
    id: '',
    description: '',
    system_prompt: '',
    use_sefaria_tools: false,
    use_mem0_tool: false,
    use_graph_context: false,
    use_research_memory: false,
    flow: 'conversational',
    language: 'ru',
    kgraph_collection: '',
    mem0_collection: '',
    research_collection: '',
    per_study_collections: false,
  });

  useEffect(() => {
    if (id) {
      fetchPersonality(id);
    }
  }, [id]);

  const fetchPersonality = async (personalityId: string) => {
    try {
      const response = await authorizedFetch(`/admin/personalities/${personalityId}`, {
        headers: {
                  }
      });
      if (response.ok) {
        const data = await response.json();
        setFormData(data);
      } else {
        console.error('Failed to load personality');
        navigate('/admin/personalities');
      }
    } catch (error) {
      console.error('Error loading personality');
      navigate('/admin/personalities');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!id) return;

    setSaving(true);
    try {
      const response = await authorizedFetch(`/admin/personalities/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
                  },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        debugLog('Personality updated successfully');
        navigate('/admin/personalities');
      } else {
        console.error('Failed to update personality');
      }
    } catch (error) {
      console.error('Error updating personality');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/admin/personalities')}>
          ← Back to Personalities
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Personality</h1>
          <p className="text-muted-foreground">Modify the personality settings</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id">ID *</Label>
            <Input
              id="id"
              value={formData.id || ''}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="flow">Flow</Label>
            <Select
              value={formData.flow || 'conversational'}
              onValueChange={(value) => setFormData(prev => ({ ...prev, flow: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conversational">Conversational</SelectItem>
                <SelectItem value="deep_research">Deep Research</SelectItem>
                <SelectItem value="talmud_json">Talmud JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select
              value={formData.language || 'ru'}
              onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">Russian</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="he">Hebrew</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Right Column - Tools and Collections */}
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tools</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="sefaria-tools"
                  checked={formData.use_sefaria_tools || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, use_sefaria_tools: e.target.checked }))}
                />
                <Label htmlFor="sefaria-tools">Use Sefaria Tools</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="mem0-tool"
                  checked={formData.use_mem0_tool || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, use_mem0_tool: e.target.checked }))}
                />
                <Label htmlFor="mem0-tool">Use Mem0 Tool</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="graph-context"
                  checked={formData.use_graph_context || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, use_graph_context: e.target.checked }))}
                />
                <Label htmlFor="graph-context">Use Graph Context</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="research-memory"
                  checked={formData.use_research_memory || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, use_research_memory: e.target.checked }))}
                />
                <Label htmlFor="research-memory">Use Research Memory</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="per-study-collections"
                  checked={formData.per_study_collections || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, per_study_collections: e.target.checked }))}
                />
                <Label htmlFor="per-study-collections">Per Study Collections</Label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Collections</Label>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="kgraph-collection" className="text-xs">Knowledge Graph Collection</Label>
                <Input
                  id="kgraph-collection"
                  value={formData.kgraph_collection || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, kgraph_collection: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mem0-collection" className="text-xs">Mem0 Collection</Label>
                <Input
                  id="mem0-collection"
                  value={formData.mem0_collection || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, mem0_collection: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="research-collection" className="text-xs">Research Collection</Label>
                <Input
                  id="research-collection"
                  value={formData.research_collection || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, research_collection: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Prompt - Full Width */}
      <div className="space-y-2">
        <Label htmlFor="system-prompt">System Prompt</Label>
        <Textarea
          id="system-prompt"
          value={Array.isArray(formData.system_prompt) ? formData.system_prompt.join('\n\n') : (formData.system_prompt || '')}
          onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
          rows={20}
          className="font-mono text-sm"
        />
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => navigate('/admin/personalities')}>
          Cancel
        </Button>
        <Button onClick={handleUpdate} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default PersonalityEdit;