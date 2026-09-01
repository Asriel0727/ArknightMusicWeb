import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEpSongTitle, findSongMatch, isExplicitEpTitle, normalizeMatchText } from '../scripts/character-ep-matching.mjs';

test('normalizes YouTube metadata without changing the song title', () => {
  assert.equal(
    normalizeMatchText('Arknights EP - Every Road is a Yes [Full Version]'),
    'everyroadisayes',
  );
});

test('matches simplified and traditional Chinese song titles', () => {
  assert.equal(normalizeMatchText('示岁'), normalizeMatchText('示歲'));
  const match = findSongMatch('示岁', [{ id: 'shisui', name: '示歲' }]);
  assert.equal(match?.songId, 'shisui');
});

test('matches an English title appended to a non-Latin PRTS title', () => {
  const match = findSongMatch('in your blue eyes', [
    { id: 'blue-eyes', name: 'in your blue eyes' },
  ]);
  assert.equal(match?.songId, 'blue-eyes');
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

test('loosely matches a Chinese song title from a non-EP video title segment', () => {
  const match = findSongMatch('明日方舟 音樂錄影帶 - 夏日來信 | 官方頻道', [
    { id: 'summer-letter', name: '夏日來信' },
  ], { loose: true, minimumScore: 88, minimumGap: 6 });

  assert.equal(match?.songId, 'summer-letter');
  assert.equal(match?.score, 100);
});

test('normalizes Chinese music labels in a non-EP title', () => {
  const match = findSongMatch('明日方舟 音樂錄影帶 - 夏日來信 | 官方頻道', [
    { id: 'summer-letter', name: '夏日來信' },
  ], { loose: true, minimumScore: 88, minimumGap: 6 });

  assert.equal(match?.score, 100);
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
