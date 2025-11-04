import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { authorizedFetch } from '../../lib/authorizedFetch';

interface Prompt {
  id: string;
  text: string;
}

interface PromptListItem {
  id: string;
  domain: string;
  name: string;
  description: string;
}

const PromptEditor: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptListItem[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const response = await authorizedFetch('/admin/prompts', {
        headers: {
                  }
      });
      if (response.ok) {
        const data = await response.json();
        setPrompts(data);
      } else {
        console.error('Failed to load prompts');
      }
    } catch (error) {
      console.error('Error loading prompts');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrompt = async (id: string) => {
    try {
      const response = await authorizedFetch(`/admin/prompts/${id}`, {
        headers: {
                  }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedPrompt(data);
      } else {
        console.error('Failed to load prompt');
      }
    } catch (error) {
      console.error('Error loading prompt');
    }
  };

  const savePrompt = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    setNotification(null);

    try {
      const response = await authorizedFetch(`/admin/prompts/${selectedPrompt.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
                  },
        body: JSON.stringify({ text: selectedPrompt.text }),
      });

      if (response.ok) {
        setNotification({ type: 'success', message: 'Prompt saved successfully! Re-fetching data...' });
        // After saving, refetch the prompt to show the real state from the server
        await fetchPrompt(selectedPrompt.id);
      } else {
        const errorData = await response.text();
        setNotification({ type: 'error', message: `Failed to save prompt: ${errorData}` });
      }
    } catch (error) {
      setNotification({ type: 'error', message: `An error occurred: ${(error as Error).message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const filteredPrompts = prompts.filter(prompt =>
    prompt.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Prompts</h1>
          <p className="text-muted-foreground">Manage system prompts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prompt List */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">Search Prompts</Label>
            <Input
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by ID, domain, name, or description..."
            />
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredPrompts.map((prompt) => (
              <Card
                key={prompt.id}
                className={`cursor-pointer transition-colors ${
                  selectedPrompt?.id === prompt.id ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
                }`}
                onClick={() => fetchPrompt(prompt.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{prompt.id}</CardTitle>
                  <CardDescription className="text-xs">
                    {prompt.domain} • {prompt.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {prompt.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Prompt Editor */}
        <div className="space-y-4">
          {selectedPrompt ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{selectedPrompt.id}</CardTitle>
                <CardDescription>
                  Edit the prompt content below
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt-text">Prompt Text</Label>
                  <Textarea
                    id="prompt-text"
                    value={selectedPrompt.text}
                    onChange={(e) => setSelectedPrompt(prev => prev ? { ...prev, text: e.target.value } : null)}
                    rows={20}
                    className="font-mono text-sm"
                    placeholder="Enter the prompt text..."
                  />
                </div>
                <div className="flex justify-end items-center gap-4">
                  {notification && (
                    <p className={cn(
                      'text-sm',
                      notification.type === 'success' ? 'text-green-600' : 'text-red-600'
                    )}>
                      {notification.message}
                    </p>
                  )}
                  <Button onClick={savePrompt} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-muted-foreground">Select a prompt from the list to edit</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptEditor;