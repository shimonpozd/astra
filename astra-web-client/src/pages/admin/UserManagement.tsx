import { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

type AdminUser = Awaited<ReturnType<typeof api.adminListUsers>>[number];

const defaultUserPayload = {
  username: '',
  password: '',
  role: 'member' as const,
  is_active: true,
};

const defaultKeyPayload = {
  provider: 'openrouter' as const,
  api_key: '',
  daily_limit: '',
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(defaultUserPayload);
  const [isCreating, setIsCreating] = useState(false);

  const [activeKeyUser, setActiveKeyUser] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState(defaultKeyPayload);
  const [isSavingKey, setIsSavingKey] = useState(false);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.adminListUsers();
      setUsers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const resetCreateForm = () => setCreateForm(defaultUserPayload);
  const resetKeyForm = () => setKeyForm(defaultKeyPayload);

  const handleCreateUser = async () => {
    if (!createForm.username.trim() || !createForm.password.trim()) {
      setError('Username and password are required');
      return;
    }
    try {
      setIsCreating(true);
      const payload = {
        username: createForm.username.trim(),
        password: createForm.password.trim(),
        role: createForm.role,
        is_active: createForm.is_active,
      };
      const created = await api.adminCreateUser(payload);
      setUsers((prev) => [created, ...prev]);
      resetCreateForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddApiKey = async (userId: string) => {
    if (!keyForm.api_key.trim()) {
      setError('API key is required');
      return;
    }
    try {
      setIsSavingKey(true);
      const payload = {
        provider: keyForm.provider,
        api_key: keyForm.api_key.trim(),
        daily_limit: keyForm.daily_limit ? Number(keyForm.daily_limit) : undefined,
      };
      const key = await api.adminCreateUserApiKey(userId, payload);
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, api_keys: [key, ...user.api_keys] } : user)),
      );
      resetKeyForm();
      setActiveKeyUser(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create API key';
      setError(message);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleToggleKey = async (userId: string, keyId: string, isActive: boolean) => {
    try {
      const updated = await api.adminUpdateUserApiKey(userId, keyId, { is_active: isActive });
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, api_keys: user.api_keys.map((key) => (key.id === keyId ? updated : key)) }
            : user,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update API key';
      setError(message);
    }
  };

  const handleDeleteKey = async (userId: string, keyId: string) => {
    if (!window.confirm('Delete this API key?')) {
      return;
    }
    try {
      await api.adminDeleteUserApiKey(userId, keyId);
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, api_keys: user.api_keys.filter((key) => key.id !== keyId) }
            : user,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete API key';
      setError(message);
    }
  };

  const handleToggleUser = async (user: AdminUser, nextActive: boolean) => {
    try {
      const updated = await api.adminUpdateUser(user.id, { is_active: nextActive });
      setUsers((prev) => prev.map((item) => (item.id === user.id ? updated : item)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setError(message);
    }
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.username.localeCompare(b.username));
  }, [users]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={createForm.username}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="border rounded-md h-10 px-2 bg-background"
                value={createForm.role}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value as 'admin' | 'member' }))}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is-active">Active</Label>
              <div className="flex items-center gap-2">
                <input
                  id="is-active"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={createForm.is_active}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                <span className="text-sm text-muted-foreground">User can log in</span>
              </div>
            </div>
          </div>
          <Button onClick={handleCreateUser} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create User'}
          </Button>
        </CardContent>
      </Card>

      <div className="border-b" />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : sortedUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="space-y-4">
          {sortedUsers.map((user) => (
            <Card key={user.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{user.username}</CardTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{user.role === 'admin' ? 'Admin' : 'Member'}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={(checked) => void handleToggleUser(user, checked)}
                    />
                    <span>{user.is_active ? 'Active' : 'Disabled'}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                  <span>Created: {new Date(user.created_at).toLocaleString()}</span>
                  <span>Updated: {new Date(user.updated_at).toLocaleString()}</span>
                  <span>Last login: {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '—'}</span>
                  <span>Manual: {user.created_manually ? 'Yes' : 'No'}</span>
                  <span>API keys: {user.api_keys.length}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">API Keys</h3>
                    <Button
                      variant={activeKeyUser === user.id ? 'destructive' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        if (activeKeyUser === user.id) {
                          setActiveKeyUser(null);
                          resetKeyForm();
                        } else {
                          setActiveKeyUser(user.id);
                          resetKeyForm();
                        }
                      }}
                    >
                      {activeKeyUser === user.id ? 'Cancel' : 'Add key'}
                    </Button>
                  </div>

                  {activeKeyUser === user.id ? (
                    <div className="rounded-md border p-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor={`provider-${user.id}`}>Provider</Label>
                          <select
                            id={`provider-${user.id}`}
                            className="border rounded-md h-10 px-2 bg-background"
                            value={keyForm.provider}
                            onChange={(event) => setKeyForm((prev) => ({ ...prev, provider: event.target.value as 'openrouter' | 'openai' }))}
                          >
                            <option value="openrouter">OpenRouter</option>
                            <option value="openai">OpenAI</option>
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`api-key-${user.id}`}>API Key</Label>
                          <Input
                            id={`api-key-${user.id}`}
                            value={keyForm.api_key}
                            onChange={(event) => setKeyForm((prev) => ({ ...prev, api_key: event.target.value }))}
                            placeholder="sk-..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`limit-${user.id}`}>Daily limit</Label>
                          <Input
                            id={`limit-${user.id}`}
                            type="number"
                            min={0}
                            value={keyForm.daily_limit}
                            onChange={(event) => setKeyForm((prev) => ({ ...prev, daily_limit: event.target.value }))}
                            placeholder="Unlimited"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void handleAddApiKey(user.id)} disabled={isSavingKey}>
                          {isSavingKey ? 'Saving…' : 'Save key'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActiveKeyUser(null);
                            resetKeyForm();
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {user.api_keys.length > 0 ? (
                    <div className="rounded-md border">
                      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground">
                        <span>Provider</span>
                        <span>Usage</span>
                        <span>Active</span>
                        <span>Created</span>
                        <span className="text-right">Actions</span>
                      </div>
                      {user.api_keys.map((key) => {
                        const usageInfo = key.daily_limit != null
                          ? `${key.usage_today}/${key.daily_limit}`
                          : `${key.usage_today}`;
                        return (
                          <div key={key.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-3 border-t px-4 py-2 text-sm">
                            <span>{key.provider.toUpperCase()} • ****{key.last_four}</span>
                            <span>{usageInfo}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={key.is_active}
                                onChange={(event) => void handleToggleKey(user.id, key.id, event.target.checked)}
                              />
                              <span className="text-xs text-muted-foreground">{key.is_active ? 'Enabled' : 'Disabled'}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{new Date(key.created_at).toLocaleDateString()}</span>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleDeleteKey(user.id, key.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No API keys assigned.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
