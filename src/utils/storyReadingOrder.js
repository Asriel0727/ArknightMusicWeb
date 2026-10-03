// Reading guidance follows the PRTS score's chapter order and intersections.
// It is a reading route, not an assertion about in-world chronology.
const mainBridges = {
  '生于黑夜': ['Ⅰ 幻灭', '读完第六章后，先读《生于黑夜》，再进入第七章。'],
  '遗尘漫步': ['Ⅱ 残阳', '放在第九章与第十章之间阅读。'],
  '照我以火': ['Ⅱ 残阳', '放在第十一章与第十二章之间阅读。'],
  '巴别塔': ['Ⅱ 残阳', '读完第十三章后补读，再进入第十四章。'],
  '追迹日落以西': ['Ⅲ 裂变', '读完第十四章后补读，再进入第十五章。'],
  '人们，我们': ['Ⅲ 裂变', '放在第十六章与第十七章之间阅读。'],
};

export function collectionFamily(collection) {
  return collection.storyLine
    ? { id: `line:${collection.storyLine}`, name: collection.lineName }
    : { id: `section:${collection.category}/${collection.section}`, name: collection.section };
}

export function buildReadingRoute(line, collections) {
  if (!line) return [];
  return line.route.map((node, index) => {
    const collection = collections.find(entry => entry.group === node.group);
    const previous = line.route[index - 1]?.group || '';
    const next = line.route[index + 1]?.group || '';
    const chapter = collection?.stories[0]?.chapterNumber;
    const bridge = line.id === 'MS' && mainBridges[node.group];
    const act = line.id === 'MS'
      ? bridge?.[0] || (chapter <= 3 ? 'init. 觉醒' : chapter <= 8 ? 'Ⅰ 幻灭' : chapter <= 14 ? 'Ⅱ 残阳' : 'Ⅲ 裂变')
      : line.name;
    let note = index === 0 ? '从这一篇开始，按本线顺序往右阅读。' : '接续前一篇，读完本篇全部段落后再继续。';
    if (line.id === 'MS' && index === 0) note = '首次阅读从序章开始，依关卡顺序阅读行动前、行动后与幕间。';
    if (bridge) note = bridge[1];
    else if (node.intersection) note = node.relation === 'prerequisite'
      ? '进入下一篇前，先补读这篇跨故事线的前置剧情。'
      : '这是前一篇衔接到的后续剧情；读完后可继续本线。';
    if (line.id === 'MS' && chapter === 9) note = '进入「残阳」篇章；本路线先完成前面的主线，再继续第九章。';
    return {
      ...(collection || {}), key: `route:${line.id}:${index}`, collectionKey: collection?.key,
      group: node.group, label: collection?.label || node.group,
      orderLabel: String(index + 1).padStart(2, '0'), act, note, previous, next,
      role: node.intersection ? (node.relation === 'prerequisite' ? '跨线前置' : line.id === 'MS' ? '穿插阅读' : '跨线后续') : '本线剧情',
      relatedLine: collection?.storyLine && collection.storyLine !== line.id ? collection.storyLine : '',
      missing: !collection,
    };
  });
}
