// Reading guidance follows the PRTS score's chapter order and intersections.
// It is a reading route, not an assertion about in-world chronology.
const mainBridges = {
  '生于黑夜': ['Ⅰ 幻灭', '第六章 → 生于黑夜 → 第七章。先补上 W 与萨卡兹佣兵的经历，再回到主线；这里回看过去，是为了理解接下来的人物关系。'],
  '遗尘漫步': ['Ⅱ 残阳', '第九章 → 遗尘漫步 → 第十章。通过凯尔希在不同地区的经历补充背景，再接回维多利亚篇。'],
  '照我以火': ['Ⅱ 残阳', '第十一章 → 照我以火 → 第十二章。在主线之间补入这条人物支线，读完再回到伦蒂尼姆的主线进展。'],
  '巴别塔': ['Ⅱ 残阳', '第十三章 → 巴别塔 → 第十四章。先回看巴别塔时期的人物关系，再阅读第十四章对这段过去的回应。'],
  '追迹日落以西': ['Ⅲ 裂变', '第十四章 → 追迹日落以西 → 第十五章。先补上维多利亚篇之后的角色去向，再进入下一阶段主线。'],
  '人们，我们': ['Ⅲ 裂变', '第十六章 → 人们，我们 → 第十七章。按照主线篇章总览的插入位置，补读乌萨斯这条支线后再接续主线。'],
};

// Curated explanations are reading advice; only explicit PRTS incoming links
// become cross-line prerequisites. An outgoing link is a branch, not a command
// to interrupt the current line and read a lone chapter out of context.
export const readingGuideSource = 'https://prts.wiki/w/关卡一览/曲谱';
const independentLines = new Set(['ST', 'TS']);
const lineIntroductions = {
  MS: '第一次阅读可从序章开始。主线按章推进，在标记的位置补读活动，再回到下一章；回忆篇放在能帮助理解后文的位置。',
  RL: '追踪罗德岛与巴别塔相关人物。活动之间保留本线次序；与主线相接的位置另列出来，跳转前可先查看该主线章的阅读准备。',
  UR: '沿乌萨斯相关角色阅读。开始活动前先检查对应的主线进度，避免直接跳进后期主线。',
  LA: '沿拉特兰相关故事阅读。跨线前置放在对应活动下，后续分支与本线下一篇分别列出。',
  KJ: '沿谢拉格故事推进。先完成本线前篇，再在相应位置补读跨线背景。',
  SI: '先认识企鹅物流相关人物，再接叙拉古系列；跨线准备与本线接续分别显示。',
  KA: '依玛莉娅·临光、红松林、长夜临光、日暮寻路阅读，把临光与骑士相关故事接起来。',
  SU: '沿岁系列逐篇阅读；每次先完成本篇段落，再进入下一篇，逐步补齐人物与事件背景。',
  RH: '沿莱茵生命相关故事阅读：孤岛风云 → 绿野幻梦 → 孤星 → 未许之地。',
  'Æ': '先认识相关人物，再沿海洋故事推进。后期活动牵涉的其他故事线，会在该篇之前列为阅读准备。',
  LE: '按莱塔尼亚相关故事浏览；同地区的故事不一律视为直接续篇，明确的跨线前置另外标出。',
  TA: '这条支线与维多利亚主线交织。先确认主线读到哪里，再补活动，最后回到相接的主线或后续活动。',
  ST: '这里收录不同的夏日故事，可按兴趣选篇。相邻卡片只是系列内的浏览次序，不代表上一篇都是下一篇的必要前置。',
  TS: '这里包含多组短篇与不同地区的故事，可按兴趣选篇。有明确前置的篇目会单独提示，不必把整条列表当作一部长篇读完。',
};
const notes = {
  '玛莉娅·临光': '从这里认识卡西米尔与骑士竞技的背景；读完后接《红松林》，补上另一组骑士的视角。',
  '红松林': '建议放在《玛莉娅·临光》之后、《长夜临光》之前，先补齐红松骑士团相关人物。',
  '长夜临光': '先读《玛莉娅·临光》与《红松林》，再看人物与线索如何在这一篇交会；读完可接《日暮寻路》。',
  '日暮寻路': '接在《长夜临光》之后阅读，继续补充相关人物的后续经历。',
  '孤岛风云': '莱茵生命线的阅读起点之一；读完后接《绿野幻梦》，逐步认识这一组织的人物关系。',
  '绿野幻梦': '接在《孤岛风云》之后补充莱茵生命内部的人物与背景，再进入《孤星》。',
  '孤星': '建议先完成《孤岛风云》与《绿野幻梦》，再阅读这一篇；读完可继续本线《未许之地》。',
  '骑兵与猎人': '作为人物认识与背景补充，放在本线开头。读完接《覆潮之下》，进入海洋相关故事。',
  '覆潮之下': '从这一篇进入本线核心故事，读完后接《愚人号》。',
  '愚人号': '先读《覆潮之下》，再接这一篇。准备进入《生路》时，另外检查该篇列出的跨线前置。',
  '沃伦姆德的薄暮': '用于认识莱塔尼亚的地区背景；随后可读《尘影余音》，但不要把两篇当作同一事件的上下集。',
  '尘影余音': '继续认识莱塔尼亚相关人物与背景；进入《崔林特尔梅之金》前，还应补读其标出的《空想花庭》。',
};
const mainSupplements = {
  '巴别塔': ['如我所见'],
  '人们，我们': ['乌萨斯的孩子们'],
};

export function readingGuideIntro(id) { return lineIntroductions[id] || '先检查本篇的阅读准备，再沿本线建议接续。'; }

export function collectionFamily(collection) {
  return collection.storyLine
    ? { id: `line:${collection.storyLine}`, name: collection.lineName }
    : { id: `section:${collection.category}/${collection.section}`, name: collection.section };
}

export function buildReadingRoute(line, collections, lines = []) {
  if (!line) return [];
  const spine = line.id === 'MS' ? line.route : line.route.filter(node => !node.intersection);
  const prerequisites = new Map(), branches = new Map();
  for (let index = 0; index < line.route.length; index++) {
    const node = line.route[index];
    if (!node.intersection || line.id === 'MS') continue;
    const incoming = node.relation === 'prerequisite';
    const anchor = incoming
      ? line.route.slice(index + 1).find(entry => !entry.intersection)
      : line.route.slice(0, index).reverse().find(entry => !entry.intersection);
    if (!anchor) continue;
    const map = incoming ? prerequisites : branches;
    const values = map.get(anchor.group) || [];
    if (!values.includes(node.group)) values.push(node.group);
    map.set(anchor.group, values);
  }
  function reference(group, kind) {
    const collection = collections.find(entry => entry.group === group);
    const targetLine = lines.find(entry => entry.id === collection?.storyLine) || lines.find(entry => entry.groups.includes(group));
    const mainChapter = collection?.stories[0]?.chapterNumber;
    return { group, kind, routeId: targetLine?.id || '', chapter: mainChapter, missing: !collection,
      note: mainChapter != null
        ? `先沿主线路径读到第${mainChapter}章，包含途中提示的活动；不要只跳读这一章。`
        : targetLine?.groups.indexOf(group) > 0
          ? '这篇在另一条故事线的中段。先查看它自己的阅读准备，再回来继续。'
          : '可先阅读这一篇，再回到当前活动继续。' };
  }
  return spine.map((node, index) => {
    const collection = collections.find(entry => entry.group === node.group);
    const previous = spine[index - 1]?.group || '';
    const next = spine[index + 1]?.group || '';
    const chapter = collection?.stories[0]?.chapterNumber;
    const bridge = line.id === 'MS' && mainBridges[node.group];
    const act = line.id === 'MS'
      ? bridge?.[0] || (chapter <= 3 ? 'init. 觉醒' : chapter <= 8 ? 'Ⅰ 幻灭' : chapter <= 14 ? 'Ⅱ 残阳' : 'Ⅲ 裂变')
      : line.name;
    let note = independentLines.has(line.id)
      ? '可以按兴趣阅读本篇；若下方列有阅读准备，请先补齐。相邻篇目不视为必读前置。'
      : notes[node.group] || (index === 0 ? '从本线这一篇开始；进入前先检查下方是否有跨线阅读准备。' : `本线建议先读《${previous}》，再读本篇。下方另列需要补读的跨线故事。`);
    if (line.id === 'MS' && index === 0) note = '首次阅读从序章开始，依关卡顺序阅读行动前、行动后与幕间。';
    if (bridge) note = bridge[1];
    if (line.id === 'MS' && chapter === 9) note = '进入「残阳」篇章；本路线先完成前面的主线，再继续第九章。';
    return {
      ...(collection || {}), key: `route:${line.id}:${index}`, collectionKey: collection?.key,
      group: node.group, label: collection?.label || node.group,
      orderLabel: String(index + 1).padStart(2, '0'), act, note, previous, next,
      role: bridge ? '此处补读' : independentLines.has(line.id) ? '独立选读' : index === 0 ? '本线起点' : '本线接续',
      independent: independentLines.has(line.id),
      prerequisites: (prerequisites.get(node.group) || []).map(group => reference(group, 'prerequisite')),
      supplements: (line.id === 'MS' ? mainSupplements[node.group] || [] : []).map(group => reference(group, 'supplement')),
      branches: (branches.get(node.group) || []).map(group => reference(group, 'followup')),
      relatedLine: collection?.storyLine && collection.storyLine !== line.id ? collection.storyLine : '',
      missing: !collection,
    };
  });
}
