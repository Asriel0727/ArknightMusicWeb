import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEpSongTitle, findSongMatch, isExplicitEpTitle, normalizeMatchText } from '../scripts/character-ep-matching.mjs';

test('normalizes YouTube metadata without changing the song title', () => {
  assert.equal(
    normalizeMatchText('Arknights EP - Every Road is a Yes [Full Version]'),
    'everyroadisayes',
  );
});

test('matches Every Road is a Yes from a standard YouTube title', () => {
  const match = findSongMatch('Arknights EP - Every Road is a Yes [Full Version]', [
    { id: 'every-road', name: 'Every Road is a Yes' },
    { id: 'other-song', name: 'Other Song' },
  ]);

  assert.deepEqual(match, {
    songId: 'every-road',
    score: 100,
    songName: 'Every Road is a Yes',
  });
});

test('recognizes a character EP title and extracts only the song name', () => {
  const title = 'Thumpy EP - Every Road is a Yes | Arknights';
  assert.equal(isExplicitEpTitle(title), true);
  assert.equal(extractEpSongTitle(title), 'Every Road is a Yes');
});

test('does not match a short song title from a larger word', () => {
  const match = findSongMatch('Weedy New Skin | Arknights', [
    { id: 'we', name: 'WE' },
    { id: 'other-song', name: 'Other Song' },
  ]);

  assert.equal(match, null);
});

test('keeps instrumental versions distinct from the original song', () => {
  const match = findSongMatch('Arknights EP - Slowly Flow, Hearthlight Glow | Arknights', [
    { id: 'original', name: 'Slowly Flow, Hearthlight Glow' },
    { id: 'instrumental', name: 'Slowly Flow, Hearthlight Glow (Instrumental)' },
  ]);

  assert.equal(match?.songId, 'original');
});

test('rejects titles below the automatic matching threshold', () => {
  const match = findSongMatch('Arknights EP - Completely Different Title', [
    { id: 'every-road', name: 'Every Road is a Yes' },
  ]);

  assert.equal(match, null);
});
