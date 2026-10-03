const phaseOrder = { entry: -1, before: 0, node: 1, after: 2, branch: 3 };
const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'zh-CN', { numeric: true });

export function archiveStory(story, metadata) {
  const line = metadata.groups?.[story.group];
  const official = metadata.stories?.[story.page];
  const chapterLine = story.archiveCategory === 'main' ? { id: 'MS', name: '为了明日', order: story.chapterNumber } : null;
  const act = story.chapterNumber <= 3 ? 'init. 觉醒' : story.chapterNumber <= 8 ? 'Ⅰ 幻灭' : story.chapterNumber <= 14 ? 'Ⅱ 残阳' : 'Ⅲ 裂变';
  return { ...story, section: chapterLine ? act : story.section, storyLine: (chapterLine || line)?.id || '', lineName: (chapterLine || line)?.name || story.section, collectionOrder: (chapterLine || line)?.order ?? null, releaseTime: metadata.dates?.[story.group] || 0, officialOrder: official?.order ?? null, storyCode: official?.code || '', orderSource: official ? 'game' : 'catalog' };
}

export function compareStoryOrder(a, b) {
  // An unmatched chapter prologue still belongs before its numbered segments.
  const prologueA = a.phase === 'entry' && a.officialOrder == null;
  const prologueB = b.phase === 'entry' && b.officialOrder == null;
  if (prologueA !== prologueB) return prologueA ? -1 : 1;
  if (a.officialOrder != null && b.officialOrder != null) return a.officialOrder - b.officialOrder || compareText(a.page, b.page);
  if (a.officialOrder != null) return -1;
  if (b.officialOrder != null) return 1;
  const pageA = a.page.replace(/\/(BEG|END|NBT|ENTRY)$/, '');
  const pageB = b.page.replace(/\/(BEG|END|NBT|ENTRY)$/, '');
  return compareText(pageA, pageB) || (phaseOrder[a.phase] ?? 1) - (phaseOrder[b.phase] ?? 1) || compareText(a.page, b.page);
}
