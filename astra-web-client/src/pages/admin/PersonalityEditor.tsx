import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
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
  name?: string;
}

interface PersonalityListItem {
  id: string;
  description?: string;
  flow?: string;
  use_sefaria_tools?: boolean;
  use_mem0_tool?: boolean;
  use_graph_context?: boolean;
  use_research_memory?: boolean;
}

const PersonalityEditor: React.FC = () => {
  const [personalities, setPersonalities] = useState<PersonalityListItem[]>([]);
  const [selectedPersonality, setSelectedPersonality] = useState<Personality | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
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
    fetchPersonalities();
  }, []);

  const fetchPersonalities = async () => {
    try {
      const response = await authorizedFetch('/admin/personalities', {
        headers: {
                  }
      });
      if (response.ok) {
        const data = await response.json();
        setPersonalities(data);
      } else {
        console.error('Failed to load personalities');
      }
    } catch (error) {
      console.error('Error loading personalities');
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonality = async (id: string) => {
    try {
      const response = await authorizedFetch(`/admin/personalities/${id}`, {
        headers: {
                  }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedPersonality(data);
        setFormData(data);
      } else {
        console.error('Failed to load personality');
      }
    } catch (error) {
      console.error('Error loading personality');
    }
  };

  const resetForm = () => {
    setFormData({
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
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const response = await authorizedFetch('/admin/personalities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
                  },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchPersonalities();
        setIsCreateDialogOpen(false);
        resetForm();
        debugLog('Personality created successfully');
      } else {
        console.error('Failed to create personality');
      }
    } catch (error) {
      console.error('Error creating personality');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedPersonality) return;

    setSaving(true);
    try {
      const response = await authorizedFetch(`/admin/personalities/${selectedPersonality.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
                  },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchPersonalities();
        setIsEditDialogOpen(false);
        setSelectedPersonality(null);
        resetForm();
        debugLog('Personality updated successfully');
      } else {
        console.error('Failed to update personality');
      }
    } catch (error) {
      console.error('Error updating personality');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPersonality) return;

    try {
      const response = await authorizedFetch(`/admin/personalities/${selectedPersonality.id}`, {
        method: 'DELETE',
        headers: {
                  }
      });

      if (response.ok) {
        await fetchPersonalities();
        setIsDeleteDialogOpen(false);
        setSelectedPersonality(null);
        debugLog('Personality deleted successfully');
      } else {
        console.error('Failed to delete personality');
      }
    } catch (error) {
      console.error('Error deleting personality');
    }
  };

  const openEditDialog = async (personality: PersonalityListItem) => {
    await fetchPersonality(personality.id);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (personality: PersonalityListItem) => {
    setSelectedPersonality(personality as Personality);
    setIsDeleteDialogOpen(true);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Personalities</h1>
          <p className="text-muted-foreground">Manage agent personalities</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger>
            <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}>
              Create New Personality
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Personality</DialogTitle>
              <DialogDescription>
                Define a new personality for the AI assistant with all its settings and tools.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-id">ID</Label>
                  <Input
                    id="create-id"
                    value={formData.id || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                    placeholder="e.g., rabbi_v2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-description">Description</Label>
                  <Input
                    id="create-description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the personality"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-flow">Flow</Label>
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
                  <Label htmlFor="create-language">Language</Label>
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
                        id="create-sefaria-tools"
                        checked={formData.use_sefaria_tools || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, use_sefaria_tools: e.target.checked }))}
                      />
                      <Label htmlFor="create-sefaria-tools">Use Sefaria Tools</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="create-mem0-tool"
                        checked={formData.use_mem0_tool || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, use_mem0_tool: e.target.checked }))}
                      />
                      <Label htmlFor="create-mem0-tool">Use Mem0 Tool</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="create-graph-context"
                        checked={formData.use_graph_context || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, use_graph_context: e.target.checked }))}
                      />
                      <Label htmlFor="create-graph-context">Use Graph Context</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="create-research-memory"
                        checked={formData.use_research_memory || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, use_research_memory: e.target.checked }))}
                      />
                      <Label htmlFor="create-research-memory">Use Research Memory</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="create-per-study-collections"
                        checked={formData.per_study_collections || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, per_study_collections: e.target.checked }))}
                      />
                      <Label htmlFor="create-per-study-collections">Per Study Collections</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Collections</Label>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="create-kgraph-collection" className="text-xs">Knowledge Graph Collection</Label>
                      <Input
                        id="create-kgraph-collection"
                        value={formData.kgraph_collection || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, kgraph_collection: e.target.value }))}
                        placeholder="e.g., astra_kgraph"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="create-mem0-collection" className="text-xs">Mem0 Collection</Label>
                      <Input
                        id="create-mem0-collection"
                        value={formData.mem0_collection || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, mem0_collection: e.target.value }))}
                        placeholder="e.g., astra_memory"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="create-research-collection" className="text-xs">Research Collection</Label>
                      <Input
                        id="create-research-collection"
                        value={formData.research_collection || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, research_collection: e.target.value }))}
                        placeholder="e.g., chevruta_deepresearch"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Prompt - Full Width */}
            <div className="mt-6 space-y-2">
              <Label htmlFor="create-system-prompt">System Prompt</Label>
              <Textarea
                id="create-system-prompt"
                value={Array.isArray(formData.system_prompt) ? formData.system_prompt.join('\n\n') : (formData.system_prompt || '')}
                onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                placeholder="The main system prompt that defines the agent's behavior"
                rows={20}
                className="font-mono text-sm"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {personalities.map((personality) => (
          <Card key={personality.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex-1">
                <CardTitle className="text-lg">{personality.id}</CardTitle>
                <CardDescription className="mt-1">{personality.description}</CardDescription>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    Flow: {personality.flow}
                  </span>
                  {personality.use_sefaria_tools && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                      Sefaria Tools
                    </span>
                  )}
                  {personality.use_mem0_tool && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                      Mem0 Tool
                    </span>
                  )}
                  {personality.use_graph_context && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
                      Graph Context
                    </span>
                  )}
                  {personality.use_research_memory && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                      Research Memory
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(personality)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openDeleteDialog(personality)}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Personality</DialogTitle>
            <DialogDescription>
              Modify the personality settings and tools.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-id">ID</Label>
                <Input
                  id="edit-id"
                  value={formData.id || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-flow">Flow</Label>
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
                <Label htmlFor="edit-language">Language</Label>
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
                      id="edit-sefaria-tools"
                      checked={formData.use_sefaria_tools || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, use_sefaria_tools: e.target.checked }))}
                    />
                    <Label htmlFor="edit-sefaria-tools">Use Sefaria Tools</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="edit-mem0-tool"
                      checked={formData.use_mem0_tool || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, use_mem0_tool: e.target.checked }))}
                    />
                    <Label htmlFor="edit-mem0-tool">Use Mem0 Tool</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="edit-graph-context"
                      checked={formData.use_graph_context || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, use_graph_context: e.target.checked }))}
                    />
                    <Label htmlFor="edit-graph-context">Use Graph Context</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="edit-research-memory"
                      checked={formData.use_research_memory || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, use_research_memory: e.target.checked }))}
                    />
                    <Label htmlFor="edit-research-memory">Use Research Memory</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="edit-per-study-collections"
                      checked={formData.per_study_collections || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, per_study_collections: e.target.checked }))}
                    />
                    <Label htmlFor="edit-per-study-collections">Per Study Collections</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Collections</Label>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="edit-kgraph-collection" className="text-xs">Knowledge Graph Collection</Label>
                    <Input
                      id="edit-kgraph-collection"
                      value={formData.kgraph_collection || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, kgraph_collection: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-mem0-collection" className="text-xs">Mem0 Collection</Label>
                    <Input
                      id="edit-mem0-collection"
                      value={formData.mem0_collection || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, mem0_collection: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-research-collection" className="text-xs">Research Collection</Label>
                    <Input
                      id="edit-research-collection"
                      value={formData.research_collection || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, research_collection: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* System Prompt - Full Width */}
          <div className="mt-6 space-y-2">
            <Label htmlFor="edit-system-prompt">System Prompt</Label>
            <Textarea
              id="edit-system-prompt"
              value={Array.isArray(formData.system_prompt) ? formData.system_prompt.join('\n\n') : (formData.system_prompt || '')}
              onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
              rows={20}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Personality</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the personality "{selectedPersonality?.id}"?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PersonalityEditor;