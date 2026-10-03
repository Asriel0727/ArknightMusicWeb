import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

export async function syncOperatorCovers(catalog, storyRoot) {
  const publicRoot = path.dirname(storyRoot);
  const manifest = JSON.parse(await readFile(path.join(publicRoot, 'images/manifest/operator-assets.json'), 'utf8'));
  const avatars = new Map(Object.values(manifest.assets.avatars).map(avatar => [avatar.label, avatar.operatorId]));
  const portraits = Object.values(manifest.assets.portraits);
  const names = [...new Set(catalog.filter(story => story.archiveCategory === 'operator').map(story => story.group))];
  const covers = new Map();
  const failures = [];
  await mkdir(path.join(storyRoot, 'thumbnails'), { recursive: true });
  for (const name of names) {
    const operatorId = avatars.get(name);
    const candidates = portraits.filter(portrait => portrait.operatorId === operatorId && ['base', 'elite'].includes(portrait.category)).sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0));
    const portrait = candidates.find(portrait => portrait.portraitId === `${operatorId}_1`) || candidates[0];
    try {
      if (!operatorId || !portrait?.publicPath) throw new Error('No matching local operator portrait');
      // A few imported _1 assets are 180 × 360 busts rather than full art.
      // Keep the corrected base artwork separate from the shared asset manifest.
      const fullSource = await readFile(path.join(storyRoot, 'operator-art', `${operatorId}_1.png`)).catch(() => null);
      const source = fullSource || await readFile(path.join(publicRoot, portrait.publicPath.replace(/^\//, '')));
      const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 12);
      const relative = `thumbnails/operator-v2-${operatorId}-${sourceHash}.webp`;
      const file = path.join(storyRoot, relative);
      if (!await readFile(file).catch(() => null)) {
        const trimmed = await sharp(source).trim().toBuffer();
        const bytes = await sharp(trimmed).resize(480, 480, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80, effort: 4 }).toBuffer();
        await writeFile(file, bytes);
      }
      covers.set(name, { operatorId, operatorPortrait: relative, operatorPortraitVersion: 'base' });
    } catch (error) { failures.push({ name, reason: error.message }); }
  }
  for (const story of catalog) {
    if (story.archiveCategory !== 'operator') continue;
    delete story.operatorPortrait;
    delete story.operatorId;
    if (covers.has(story.group)) Object.assign(story, covers.get(story.group));
  }
  await writeFile(path.join(storyRoot, 'operator-cover-report.json'), `${JSON.stringify({ operators: names.length, cached: covers.size, stories: catalog.filter(story => story.operatorPortrait).length, failures }, null, 2)}\n`);
  console.log(`Operator record covers: ${covers.size} / ${names.length} local portraits`);
}
