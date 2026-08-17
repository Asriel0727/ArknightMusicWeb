import assert from 'node:assert/strict';
import test from 'node:test';
import { findSongMatch, normalizeMatchText } from '../scripts/character-ep-matching.mjs';

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

test('rejects titles below the automatic matching threshold', () => {
  const match = findSongMatch('Arknights EP - Completely Different Title', [
    { id: 'every-road', name: 'Every Road is a Yes' },
  ]);

  assert.equal(match, null);
});
