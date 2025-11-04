import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { debugLog } from '../../utils/debugLogger';
import { authorizedFetch } from '../../lib/authorizedFetch';

interface PersonalityListItem {
  id: string;
  description?: string;
  flow?: string;
  use_sefaria_tools?: boolean;
  use_mem0_tool?: boolean;
  use_graph_context?: boolean;
  use_research_memory?: boolean;
}

const PersonalityList: React.FC = () => {
  const navigate = useNavigate();
  const [personalities, setPersonalities] = useState<PersonalityListItem[]>([]);
  const [selectedPersonality, setSelectedPersonality] = useState<PersonalityListItem | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const openDeleteDialog = (personality: PersonalityListItem) => {
    setSelectedPersonality(personality);
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
        <Button onClick={() => navigate('/admin/personalities/new')}>
          Create New Personality
        </Button>
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
                  onClick={() => navigate(`/admin/personalities/edit/${personality.id}`)}
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

export default PersonalityList;