export function resolveStoryPortrait(name, index, variables = {}) {
  const raw = String(name || '');
  const [alias, expression = ''] = raw.split('#');
  const key = (alias.startsWith('$') ? variables[alias.slice(1)] || alias : alias).toLowerCase();
  const character = index[key];
  if (!character) return null;
  const face = character.array?.find(item => item.name === expression || expression && item.alias === expression) || character.array?.[0];
  if (!face) return null;
  const group = character.groups?.[face.group];
  const url = path => typeof path === 'string' && /^[A-Za-z0-9_$\/#-]+$/.test(path) ? `https://torappu.prts.wiki/assets/avg/characters/${path.split('/').map(encodeURIComponent).join('/')}.png` : '';
  if (group?.mode === 'face_overlay') return { baseUrl: url(group.base), faceUrl: url(face.face), faceRect: group.faceRect };
  return { baseUrl: url(face.image || face.name), faceUrl: '' };
}
