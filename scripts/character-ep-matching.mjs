export function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/角色\s*ep|character\s*ep|明日方舟|arknights\s*ep|塞壬唱片|monstersiren|rivervworkshop|official|musicvideo|full\s*version|instrumental|\binst\b|\bversion\b|\bver\b|完整版|官方|音樂錄影帶|歌曲|主題曲|純音樂|伴奏|\bep\b/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
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

function getTitleVariants(title) {
  const source = String(title || '');
  const variants = new Set([normalizeMatchText(source)]);
  for (const part of source.split(/[-–—|｜:：]/)) variants.add(normalizeMatchText(part));
  for (const quoted of source.matchAll(/[《「『"'【\[]([^》」』"'】\]]+)[》」』"'】\]]/g)) {
    variants.add(normalizeMatchText(quoted[1]));
  }
  return [...variants].filter((variant) => variant.length >= 2);
}

export function findSongMatch(title, songs, { report = false } = {}) {
  const titleVariants = getTitleVariants(title);
  if (!titleVariants.length) return null;

  const candidatesByName = new Map();
  for (const song of songs) {
    const normalizedSong = normalizeMatchText(song.name);
    if (normalizedSong.length < 2) continue;
    const similarity = Math.max(...titleVariants.map((variant) => {
      if (variant.includes(normalizedSong) || normalizedSong.includes(variant)) return 1;
      return diceSimilarity(variant, normalizedSong);
    }));
    const candidate = { songId: String(song.id), score: Math.round(similarity * 100), songName: song.name };
    const previous = candidatesByName.get(normalizedSong);
    if (!previous || candidate.score > previous.score) candidatesByName.set(normalizedSong, candidate);
  }
  const candidates = [...candidatesByName.values()];
  candidates.sort((left, right) => right.score - left.score);
  const [best, runnerUp] = candidates;
  if (!best || best.score < 82 || (best.score < 94 && runnerUp && best.score - runnerUp.score < 8)) {
    const suggestions = candidates.slice(0, 3).map((candidate) => `${candidate.songName} (${candidate.score}%)`).join(', ');
    if (report) console.warn(`No confident song match for "${title}". Candidates: ${suggestions || 'none'}`);
    return null;
  }
  return best;
}
