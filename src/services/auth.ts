import { authStorage, StoredUser } from '../lib/authStorage';

const API_BASE = '/api';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: StoredUser;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Invalid credentials');
    throw new Error(message || 'Failed to login');
  }

  const data = (await response.json()) as LoginResponse;
  return data;
}

export function logout() {
  authStorage.clear();
}
