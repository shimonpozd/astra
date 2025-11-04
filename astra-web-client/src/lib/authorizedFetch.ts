import { authStorage } from './authStorage';

export async function authorizedFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const token = authStorage.getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    authStorage.notifyUnauthorized();
  }
  return response;
}
