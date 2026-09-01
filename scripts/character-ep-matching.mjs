import OpenCC from 'opencc-js';

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' });

export function normalizeMatchText(value) {
  let source = String(value || '');
  try {
    // PRTS uses simplified Chinese while some music records are stored in
    // traditional Chinese. Canonicalize both sides before comparing titles.
    source = toTraditional(source);
  } catch {
    // Matching should remain usable if the optional converter cannot initialize.
  }

  return source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:character\s*)?ep\b|\barknights\b|\bmonstersiren\b|\briverv\s*workshop\b|\bofficial\b|\bmusic\s*video\b|\bmv\b|\bost\b|\bfull\s*version\b|\bversion\b|\bver\b|音樂錄影帶|音乐录影带|音樂|音乐|歌曲|主題曲|主题曲/gi, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function isExplicitEpTitle(title) {
  return /\bep\s*[-–—:：|]/i.test(String(title || ''));
}

export function extractEpSongTitle(title) {
  const source = String(title || '');
  const epMarker = source.match(/\bep\s*[-–—:：|]\s*(.+)$/i);
  const afterMarker = epMarker?.[1] || source;
  return afterMarker.split(/\s*\|\s*/)[0].trim();
}

function diceSimilarity(left, right) {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = new Map();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  let shared = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) || 0;
    if (count) {
      shared += 1;
      pairs.set(pair, count - 1);
    }
  }
  return (2 * shared) / (left.length + right.length - 2);
}

function isShortLatinTitle(value) {
  return /^[a-z0-9]+$/i.test(value) && value.length < 4;
}

function getTitleVariants(title, { loose = false } = {}) {
  const songTitle = extractEpSongTitle(title);
  const variants = new Set([
    normalizeMatchText(songTitle),
    normalizeMatchText(String(songTitle).replace(/\[[^\]]*\]/g, '')),
  ]);
  if (loose) {
    for (const part of String(title || '').split(/[|｜:：\-–—]/)) {
      variants.add(normalizeMatchText(part));
    }
  }
  return [...variants].filter((variant) => variant.length >= 2);
}

export function findSongMatch(title, songs, {
  report = false,
  loose = false,
  minimumScore = 90,
  minimumGap = 10,
} = {}) {
  const titleVariants = getTitleVariants(title, { loose });
  if (!titleVariants.length) return null;

  const candidates = songs.map((song) => {
    const normalizedSong = normalizeMatchText(song.name);
    if (normalizedSong.length < 2) return null;

    const score = Math.max(...titleVariants.map((variant) => {
      if (variant === normalizedSong) return 1;
      if (isShortLatinTitle(normalizedSong)) return 0;
      if (variant.includes(normalizedSong) || normalizedSong.includes(variant)) return 0.96;
      return diceSimilarity(variant, normalizedSong);
    }));
    return { songId: String(song.id), score: Math.round(score * 100), songName: song.name };
  }).filter(Boolean);

  candidates.sort((left, right) => right.score - left.score);
  const [best, runnerUp] = candidates;
  const isExact = best?.score === 100;
  const isConfidentFuzzy = best?.score >= minimumScore && (!runnerUp || best.score - runnerUp.score >= minimumGap);
  if (!best || (!isExact && !isConfidentFuzzy)) {
    const suggestions = candidates.slice(0, 3).map((candidate) => `${candidate.songName} (${candidate.score}%)`).join(', ');
    if (report) console.warn(`No confident song match for "${title}". Candidates: ${suggestions || 'none'}`);
    return null;
  }
  return best;
}
