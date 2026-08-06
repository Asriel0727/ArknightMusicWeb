import {
  activityExpectsRecruitmentPool,
  attachCuratedActivityRecruitmentPools,
  getActivityClassification,
} from '../src/data/activityCatalog.js';

const API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const SERVERS = ['tw', 'global', 'cn'];
const STORY_TYPES = new Set(['side_story', 'intermezzi']);

function localized(value) {
  return value?.['zh-TW'] || value?.['zh-CN'] || value?.en || Object.values(value || {}).find(Boolean) || '—';
}

function isStory(activity) {
  const classification = getActivityClassification(activity);
  return classification ? classification === 'story' : STORY_TYPES.has(activity.type);
}

for (const server of SERVERS) {
  const response = await fetch(`${API_BASE}/api/activities?server=${server}`);
  const payload = await response.json();
  const activities = attachCuratedActivityRecruitmentPools(payload.activities || [], server);
  const stories = activities.filter(isStory);
  const expected = stories.filter(activityExpectsRecruitmentPool);
  const missingPools = expected.filter((activity) => !activity.recruitment_pools?.length);
  const missingImages = expected.flatMap((activity) => (activity.recruitment_pools || [])
    .filter((pool) => !pool.image_url)
    .map((pool) => `${activity.code} → ${localized(pool.name_i18n)}`));
  const missingOperators = expected.flatMap((activity) => (activity.recruitment_pools || [])
    .filter((pool) => !pool.operators?.length)
    .map((pool) => `${activity.code} → ${localized(pool.name_i18n)}`));
  const missingOperatorIds = expected.flatMap((activity) => (activity.recruitment_pools || [])
    .flatMap((pool) => (pool.operators || [])
      .filter((operator) => !operator.id)
      .map((operator) => `${activity.code} → ${localized(pool.name_i18n)} → ${localized(operator.name_i18n)}`)));

  console.log(`\n[${server}] stories=${stories.length}, expectedPools=${expected.length}`);
  console.log(`missingPools=${missingPools.length}`);
  for (const activity of missingPools) console.log(`  ${activity.code} | ${localized(activity.name_i18n)}`);
  console.log(`missingImages=${missingImages.length}`);
  for (const item of missingImages) console.log(`  ${item}`);
  console.log(`missingOperators=${missingOperators.length}`);
  for (const item of missingOperators) console.log(`  ${item}`);
  console.log(`missingOperatorIds=${missingOperatorIds.length}`);
  for (const item of missingOperatorIds) console.log(`  ${item}`);
  const rerunPools = stories
    .filter((activity) => /rerun|復刻|复刻|20\d{2}/iu.test(`${activity.code} ${localized(activity.name_i18n)}`))
    .filter((activity) => activity.recruitment_pools?.length)
    .map((activity) => `${activity.code} | ${localized(activity.name_i18n)} → ${activity.recruitment_pools.map((pool) => localized(pool.name_i18n)).join(', ')}`);
  console.log(`rerunPools=${rerunPools.length}`);
  for (const item of rerunPools) console.log(`  ${item}`);
}
