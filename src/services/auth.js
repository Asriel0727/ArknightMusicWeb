import { reactive } from 'vue';
import { API_ORIGIN } from './api.js';

const AUTH_STORAGE_KEY = 'arknights:user-session:v1';

export const authState = reactive({
  session: null,
  user: null,
  isLoading: false,
  error: '',
});

function saveSession(session) {
  authState.session = session;
  authState.user = session?.user || null;

  try {
    if (session?.access_token) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Private mode storage failures should not block auth state in memory.
  }
}

export function getAuthToken() {
  return authState.session?.access_token || '';
}

export function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function initAuth() {
  if (authState.session) {
    return authState.session;
  }

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const session = JSON.parse(raw);
    if (!session?.access_token) {
      return null;
    }

    authState.session = session;
    authState.user = session.user || null;
    await refreshCurrentUser();
    return authState.session;
  } catch {
    saveSession(null);
    return null;
  }
}

export async function signIn(loginKey, password) {
  return submitAuth('/api/auth/sign-in', loginKey, password);
}

export async function signUp(loginKey, password) {
  return submitAuth('/api/auth/sign-up', loginKey, password);
}

export function signOut() {
  saveSession(null);
}

async function submitAuth(path, loginKey, password) {
  authState.isLoading = true;
  authState.error = '';

  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ loginKey, password }),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || '登入失敗');
    }

    saveSession(data.session);
    return data.session;
  } catch (error) {
    authState.error = error.message;
    throw error;
  } finally {
    authState.isLoading = false;
  }
}

export async function refreshCurrentUser() {
  if (!getAuthToken()) {
    return null;
  }

  const response = await fetch(`${API_ORIGIN}/api/auth/user`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    saveSession(null);
    throw new Error(data.error || '登入已失效');
  }

  authState.user = data.user;
  authState.session = {
    ...authState.session,
    user: data.user,
  };
  saveSession(authState.session);
  return data.user;
}
