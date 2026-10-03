export const storyCategories = [
  { id: 'main', labels: { 'zh-TW': '主線劇情', 'zh-CN': '主线剧情', en: 'Main story' } },
  { id: 'event', labels: { 'zh-TW': '大型活動', 'zh-CN': '大型活动', en: 'Story events' } },
  { id: 'vignette', labels: { 'zh-TW': '故事集', 'zh-CN': '故事集', en: 'Vignettes' } },
  { id: 'operator', labels: { 'zh-TW': '干員密錄', 'zh-CN': '干员密录', en: 'Operator records' } },
  { id: 'roguelike', labels: { 'zh-TW': '集成戰略', 'zh-CN': '集成战略', en: 'Integrated Strategies' } },
  { id: 'reclamation', labels: { 'zh-TW': '生息演算', 'zh-CN': '生息演算', en: 'Reclamation Algorithm' } },
  { id: 'contract', labels: { 'zh-TW': '危機合約', 'zh-CN': '危机合约', en: 'Contingency Contract' } },
  { id: 'special', labels: { 'zh-TW': '特殊劇情／企劃', 'zh-CN': '特殊剧情／企划', en: 'Special stories' } },
  { id: 'beta', labels: { 'zh-TW': '內測劇情', 'zh-CN': '内测剧情', en: 'Beta stories' } },
];

const chapters = ['黑暗时代·上', '黑暗时代·下', '异卵同生', '二次呼吸', '急性衰竭', '靶向药物', '局部坏死', '苦难摇篮', '怒号光明', '风暴瞭望', '破碎日冕', '淬火尘霾', '惊霆无声', '恶兆湍流', '慈悲灯塔', '离解复合', '反常光谱', '相变临界'];
const roguelikes = new Set(['刻俄柏的灰蕈迷境', '傀影与猩红孤钻', '水月与深蓝之树', '探索者的银凇止境', '萨卡兹的无终奇语', '岁的界园志异', '沉沦者的黑流树海']);
const reclamations = new Set(['沙中之火', '沙洲遗闻', '重启锚点']);
const collaborations = new Set(['源石尘行动', '落叶逐火', '水晶箭行动', '泰拉饭']);
const vignettes = new Set(['战地秘闻', '洪炉示岁', '午间逸话', '乌萨斯的孩子们', '踏寻往昔之风', '此地之外', '灯火序曲', '如我所见', '红松林', '阴云火花', '未尽篇章', '日暮寻路', '好久不见', '春分', '眠于树影之中', '去咧嘴谷', '熔炉“还魂”记', '我们明日见', '镜中集', '十字路口', '丛林症结']);
const aprilStories = new Set(['断罪者的挑战状', '泰拉 说唱之夜！', '狂弹要塞！罗德大兵集结', '主播U：全能系美少女', '好得不能再好了！泰拉投资大师课', 'ARKnoNIGHTS', 'Rhodes Island Epic 黑色博士坠落']);

export function classifyStory(story) {
  const page = story.page || '';
  const sourceGroup = story.sourceGroup || story.group || '其他剧情';
  let group = sourceGroup;
  let archiveCategory = 'special';
  let section = '特别企划';
  let chapterNumber = chapters.indexOf(group);
  const beta = page.match(/^(唤醒测试|收束测试|回声测试)\/(.+)/);
  if (beta) {
    archiveCategory = 'beta';
    section = beta[1];
    const code = beta[2].split('/')[0];
    group = code === '序章' ? '序章' : /^\d+-/.test(code) ? `第 ${code.split('-')[0]} 章` : /^(LS|CE|AP|SK|CA)-/.test(code) ? '资源关卡' : '特殊关卡';
  } else if (/\/干员密录\//.test(page) || story.category === '干员密录') {
    archiveCategory = 'operator'; section = '干员密录'; group = page.split('/')[0];
  } else if (roguelikes.has(group)) {
    archiveCategory = 'roguelike'; section = '主题故事';
  } else if (reclamations.has(group)) {
    archiveCategory = 'reclamation'; section = '主题故事';
  } else if (group === '危机合约') {
    archiveCategory = 'contract'; section = '危机合约';
  } else if (chapterNumber >= 0 || /^\d+-\d+ .+\/AVG$/.test(page)) {
    archiveCategory = 'main'; section = '章节剧情';
    if (chapterNumber < 0) { chapterNumber = Number(page.split('-')[0]); group = chapters[chapterNumber] || `第 ${chapterNumber} 章`; }
  } else if (/^EP\d+\/ENTRY$/.test(page)) {
    archiveCategory = 'main'; section = '章节序曲'; chapterNumber = Number(page.match(/^EP(\d+)/)[1]); group = chapters[chapterNumber] || `第 ${chapterNumber} 章`;
  } else if (vignettes.has(group)) {
    archiveCategory = 'vignette'; section = '故事集';
  } else if (story.category === '支线' && group !== '剧情') {
    archiveCategory = 'event'; section = collaborations.has(group) ? '联动活动' : '故事活动';
  } else if (page === '采购中心/剧情') {
    section = '新手引导'; group = '采购中心';
  } else if (page === '隐藏剧情/剧情') {
    section = '隐藏剧情'; group = '隐藏剧情';
  } else if (page === '多维合作/剧情') {
    section = '玩法引导'; group = '多维合作';
  } else if (page === 'AC01/ENTRY') {
    section = '玩法引导'; group = '自走棋序曲';
  } else if (page === 'SL01/ENTRY') {
    section = '玩法引导'; group = '军团玩法序曲';
  } else if (group === '荷谟伊智境') {
    section = '联锁竞赛';
  } else if (aprilStories.has(group)) {
    section = '愚人节企划';
  } else if (/^CFA-/.test(page)) {
    group = 'CFA 企划';
  }
  const phase = /\/SP\d+$/.test(page) ? 'branch' : /\/BEG$/.test(page) ? 'before' : /\/END$/.test(page) ? 'after' : /\/ENTRY$/.test(page) ? 'entry' : 'node';
  return { ...story, sourceGroup, archiveCategory, section, group, chapterNumber: archiveCategory === 'main' ? chapterNumber : null, phase };
}

export function storyGroupLabel(story) {
  return story.archiveCategory === 'main' && story.chapterNumber >= 0 ? `EP ${String(story.chapterNumber).padStart(2, '0')} · ${story.group}` : story.group;
}
