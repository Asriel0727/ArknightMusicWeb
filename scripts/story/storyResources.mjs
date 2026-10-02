import { createHash } from 'node:crypto';
import { parseStoryScript } from '../../src/utils/storyScript.js';

const characterKinds = new Set(['character', 'charslot']);
const audioKinds = new Set(['playmusic', 'playsound']);

export function extractStoryText(raw) {
  const text = String(raw || '').replaceAll('\r\n', '\n').trim();
  const marker = text.match(/\|\s*文本数据\s*=\s*\n/);
  const source = marker ? text.slice(marker.index + marker[0].length).split(/^\s*}}\s*$/m)[0].trim() : text;
  const commands = parseStoryScript(source);
  if (commands[0]?.kind !== 'header' || !commands.some((command) => command.kind === 'dialogue')) {
    throw new Error('Unexpected script format');
  }
  return `${source.split('\n').map((line) => line.trimEnd()).join('\n')}\n`;
}

export function collectStoryResources(source, variables = {}) {
  const images = new Set();
  const audio = new Set();
  const videos = new Set();
  const commands = parseStoryScript(source);
  const resolve = (value) => {
    const key = String(value || '').split('#')[0].trim();
    return key.startsWith('$') ? variables[key.slice(1)] || key : key;
  };

  for (const { kind, attributes: a } of commands) {
    if (a.image) images.add(resolve(a.image));
    if (characterKinds.has(kind)) {
      for (const field of ['name', 'name2', 'name3']) {
        const id = resolve(a[field]);
        if (id) images.add(id);
      }
    }
    if (audioKinds.has(kind)) {
      for (const field of ['intro', 'key']) {
        const id = String(a[field] || '').replace(/^\$/, '');
        if (id) audio.add(id);
      }
    }
    if (kind === 'playvideo' || kind === 'video') {
      const id = resolve(a.key || a.name || a.video);
      if (id) videos.add(id);
    }
  }
  return { images: [...images], audio: [...audio], videos: [...videos], commands };
}

export function imageCandidates(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Unsupported image ID: ${id}`);
  const names = [`Avg_${id}.png`];
  if (id.startsWith('bg_')) names.push(`Avg_bg_${id}.png`);
  return names.map((name) => {
    const hash = createHash('md5').update(name).digest('hex');
    return `https://media.prts.wiki/${hash[0]}/${hash.slice(0, 2)}/${name}`;
  });
}

export function audioUrl(key, variables) {
  const resource = variables[key];
  if (typeof resource !== 'string' || !resource.startsWith('Sound_Beta_2/')) {
    throw new Error(`No PRTS audio mapping for ${key}`);
  }
  const relative = resource.slice('Sound_Beta_2/'.length);
  if (!/^[A-Za-z0-9_/-]+$/.test(relative)) throw new Error(`Unsafe audio path for ${key}`);
  return `https://torappu.prts.wiki/assets/audio/${relative.toLowerCase()}.mp3`;
}
