import { API_ORIGIN } from './api.js';
import { getAuthHeaders } from './auth.js';

async function userRequest(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    body: options.body && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export async function fetchFavoriteSongs() {
  const data = await userRequest('/api/user/favorite-songs');
  return data.favorites || [];
}

export async function addFavoriteSong(songCid) {
  const data = await userRequest('/api/user/favorite-songs', {
    method: 'POST',
    body: { songCid },
  });
  return data.favorite;
}

export async function removeFavoriteSong(songCid) {
  return userRequest(`/api/user/favorite-songs?songCid=${encodeURIComponent(songCid)}`, {
    method: 'DELETE',
  });
}

export async function fetchPlaylists() {
  const data = await userRequest('/api/user/playlists');
  return data.playlists || [];
}

export async function createPlaylist(name, description = '') {
  const data = await userRequest('/api/user/playlists', {
    method: 'POST',
    body: { name, description },
  });
  return data.playlist;
}

export async function addSongToPlaylist(playlistId, songCid) {
  const data = await userRequest(`/api/user/playlists/${encodeURIComponent(playlistId)}/songs`, {
    method: 'POST',
    body: { songCid },
  });
  return data.item;
}

export async function fetchCharacterLists() {
  const data = await userRequest('/api/user/character-lists');
  return data.lists || [];
}

export async function createCharacterList(name, description = '') {
  const data = await userRequest('/api/user/character-lists', {
    method: 'POST',
    body: { name, description },
  });
  return data.list;
}

export async function addCharacterToList(listId, characterId) {
  const data = await userRequest(`/api/user/character-lists/${encodeURIComponent(listId)}/items`, {
    method: 'POST',
    body: { characterId },
  });
  return data.item;
}
