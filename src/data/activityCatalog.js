function story(recruitmentPools = [], options = {}) {
  return { classification: 'story', recruitmentPools, expectsRecruitmentPool: options.expectsRecruitmentPool !== false };
}

function mini() {
  return { classification: 'mini', recruitmentPools: [] };
}

// Shared by TW, Global, and CN. Server selection controls release windows only;
// an activity's classification and banner identity always come from this table.
const ACTIVITY_CATALOG = {
  'wiki-unrealized-realities': story([
    {
      slug: '600-meters-over-the-facts',
      kind: 'event',
      name_i18n: {
        'zh-TW': '現實之上六百米',
        'zh-CN': '现实之上六百米',
        en: '600 Meters Over The Facts',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_UR_600_Meters_Over_The_Facts.png',
      operators: [
        { id: 'char_4212_nasti', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '娜斯提', 'zh-CN': '娜斯提', en: 'Nasti' } },
        { id: 'char_4214_cairn', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '響石', 'zh-CN': '响石', en: 'Cairn' } },
        { id: 'char_4040_rockr', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '洛洛', 'zh-CN': '洛洛', en: 'Rockrock' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Unrealized_Realities',
    },
  ]),
  'wiki-medjehtiqedti-bound': story([
    {
      slug: 'quester-in-frozen-moments',
      kind: 'standard',
      name_i18n: {
        'zh-TW': '在凝固的時光中探尋',
        'zh-CN': '在凝固的时光中探寻',
        en: 'Quester in Frozen Moments',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_ME_Quester_in_Frozen_Moments.png',
      operators: [
        { id: 'char_4056_titi', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '緹緹', 'zh-CN': '缇缇', en: 'Titi' } },
        { id: 'char_1022_flwr2', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '擷英調香師', 'zh-CN': '撷英调香师', en: 'Perfumer the Distilled' } },
        { id: 'char_4079_haini', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '海霓', 'zh-CN': '海霓', en: 'Haini' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Medjehtiqedti_Bound',
    },
  ]),
  'wiki-retracing-our-steps': story([
    {
      slug: 'a-shared-oath-of-guardianship',
      kind: 'limited',
      name_i18n: {
        'zh-TW': '以風雪為誓',
        'zh-CN': '以风雪为誓',
        en: 'A Shared Oath of Guardianship',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_OS_A_Shared_Oath_of_Guardianship.png',
      operators: [
        { id: 'char_1045_svash2', rarity: 6, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '凜御銀灰', 'zh-CN': '凛御银灰', en: 'SilverAsh the Reignfrost' } },
        { id: 'char_1046_sbell2', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '聖聆初雪', 'zh-CN': '圣聆初雪', en: 'Pramanix the Prerita' } },
        { id: 'char_1038_whitw2', rarity: 6, featured: 'secondary', limited: true, name_i18n: { 'zh-TW': '荒蕪拉普蘭德', 'zh-CN': '荒芜拉普兰德', en: 'Lappland the Decadenza' } },
        { id: 'char_1035_wisdel', rarity: 6, featured: 'secondary', limited: true, name_i18n: { 'zh-TW': '維什戴爾', 'zh-CN': '维什戴尔', en: 'Wis’adel' } },
        { id: 'char_245_cello', rarity: 6, featured: 'secondary', limited: true, name_i18n: { 'zh-TW': '塑心', 'zh-CN': '塑心', en: 'Virtuosa' } },
        { id: 'char_4211_snhunt', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '雪獵', 'zh-CN': '雪猎', en: 'Snow Hunter' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Retracing_Our_Steps',
    },
  ]),
  'wiki-first-of-a-thousand-autumns': story([
    {
      slug: 'ashes-to-ashes-ages-on-ages',
      kind: 'limited',
      name_i18n: {
        'zh-TW': '劫盡古今',
        'zh-CN': '劫尽古今',
        en: 'Ashes to Ashes, Ages on Ages',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_Ashes_to_Ashes,_Ages_on_Ages_banner.png',
      operators: [
        { id: 'char_2027_wang', rarity: 6, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '望', 'zh-CN': '望', en: 'Wang' } },
        { id: 'char_1050_chen3', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '赤刃明霄陳', 'zh-CN': '赤刃明霄陈', en: "Ch'en the Dawnstreak" } },
        { id: 'char_4222_taraxa', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '風絮', 'zh-CN': '风絮', en: 'Taraxacum' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/First_of_A_Thousand_Autumns',
    },
  ]),
  'wiki-act-or-die': story([
    {
      slug: 'dithyramb-unending',
      kind: 'event',
      name_i18n: {
        'zh-TW': '永不落幕',
        'zh-CN': '永不落幕',
        en: 'Dithyramb Unending',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_Dithyramb_Unending_banner.png',
      operators: [
        { id: 'char_1042_phatm2', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '酒神', 'zh-CN': '酒神', en: 'Tragodia' } },
        { id: 'char_4191_tippi', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '蒂比', 'zh-CN': '蒂比', en: 'Tippi' } },
        { id: 'char_4040_rockr', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '洛洛', 'zh-CN': '洛洛', en: 'Rockrock' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Act_or_Die',
    },
  ]),
  'wiki-act-or-die-rerun': story([
    {
      slug: 'dithyramb-unending-rerun',
      kind: 'standard',
      name_i18n: {
        'zh-TW': '永不落幕',
        'zh-CN': '永不落幕',
        en: 'Dithyramb Unending Rerun',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/CN_Dithyramb_Unending_Rerun_banner.png',
      operators: [
        { id: 'char_1042_phatm2', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '酒神', 'zh-CN': '酒神', en: 'Tragodia' } },
        { id: 'char_4191_tippi', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '蒂比', 'zh-CN': '蒂比', en: 'Tippi' } },
        { id: 'char_4178_alanna', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '阿蘭娜', 'zh-CN': '阿兰娜', en: 'Alanna' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Act_or_Die/Rerun',
    },
  ]),
  'wiki-people-a-people': story([
    {
      slug: 'rage-of-the-many',
      kind: 'standard',
      name_i18n: {
        'zh-TW': '闢路之人',
        'zh-CN': '辟路之人',
        en: 'Rage of The Many',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/CN_Rage_of_The_Many_banner.png',
      operators: [
        { id: 'char_1051_headb2', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '怒潮凜冬', 'zh-CN': '怒潮凛冬', en: 'Zima the Raging Tide' } },
        { id: 'char_4224_turdus', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '烏啾', 'zh-CN': '乌啾', en: 'Ukusik' } },
        { id: 'char_4147_mitm', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '渡橋', 'zh-CN': '渡桥', en: 'Mitm' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/People,_A_People',
    },
  ]),
  'wiki-somniloquium-serenum': story([
    {
      slug: 'cantilena-puppae',
      kind: 'limited',
      name_i18n: {
        'zh-TW': '人偶的歌謠',
        'zh-CN': '人偶的歌谣',
        en: 'Cantilena Puppae',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_SS_Cantilena_Puppae.png',
      operators: [
        { id: 'char_4182_oblvns', rarity: 6, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '豐川祥子', 'zh-CN': '丰川祥子', en: 'Sakiko Togawa' } },
        { id: 'char_4184_dolris', rarity: 5, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '三角初華', 'zh-CN': '三角初华', en: 'Uika Misumi' } },
        { id: 'char_4183_mortis', rarity: 5, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '若葉睦', 'zh-CN': '若叶睦', en: 'Mutsumi Wakaba' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Somniloquium_Serenum',
    },
  ]),
  'wiki-thunder-in-the-azure-dream': story([
    {
      slug: 'hunters-of-the-umbral-wilds',
      kind: 'limited',
      name_i18n: {
        'zh-TW': '幽境獵人',
        'zh-CN': '幽境狩人',
        en: 'Hunters of the Umbral Wilds',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/CN_Hunters_of_the_Umbral_Wilds_banner.png',
      operators: [
        { id: 'char_1048_orchd2', rarity: 6, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '焰狐龍梓蘭', 'zh-CN': '焰狐龙梓兰', en: 'Violet Mizutsune Orchid' } },
        { id: 'char_1049_catap2', rarity: 5, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '雷狼龍S空爆', 'zh-CN': '雷狼龙S空爆', en: 'Zinogre S Catapult' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Thunder_in_the_Azure_Dream',
    },
  ]),
  'wiki-code-of-brawl': story([
    {
      slug: 'lock-and-load',
      kind: 'standard',
      name_i18n: {
        'zh-TW': '鎖與匙的守衛者',
        'zh-CN': '锁与匙的守卫者',
        en: 'Lock & Load',
      },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_CB_Keeper_of_the_Lock_%26_Keys.png',
      operators: [
        { id: 'char_213_mostma', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '莫斯提馬', 'zh-CN': '莫斯提马', en: 'Mostima' } },
        { id: 'char_243_waaifu', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '槐琥', 'zh-CN': '槐琥', en: 'Waai Fu' } },
        { id: 'char_158_milu', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '守林人', 'zh-CN': '守林人', en: 'Firewatch' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/Code_of_Brawl',
    },
  ]),
  // Vignettes are story activities even when the upstream API does not label
  // them as side stories or intermezzi.
  'wiki-bolivar-diagnosed': story([
    {
      slug: 'deterministic-chaos',
      kind: 'standard',
      name_i18n: {
        'zh-TW': '確定性混沌',
        'zh-CN': '确定性混沌',
        en: 'Deterministic Chaos',
      },
      image_url: 'https://web.hycdn.cn/upload/image/20260702/bcf1014142df03beba247b134ef14921.png',
      operators: [
        { id: 'char_4229_aphris', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '謬因', 'zh-CN': '谬因', en: 'Miuin' } },
        { id: 'char_4234_pedro', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '佩德洛', 'zh-CN': '佩德洛', en: 'Pedro' } },
        { id: 'char_4171_wulfen', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '鉬鉛', 'zh-CN': '钼铅', en: 'Wulfenite' } },
      ],
      source_url: 'https://ak.hypergryph.com/news/9686',
    },
  ]),
  'wiki-the-rides-to-lake-silberneherze': story([
    {
      slug: 'the-sojourner-rerun',
      kind: 'standard',
      name_i18n: {
        'zh-TW': '遊邦者',
        'zh-CN': '游邦者',
        en: 'The Sojourner Rerun',
      },
      image_url: 'https://prts.wiki/w/Special:Redirect/file/%E5%8D%A1%E6%B1%A0%E5%9B%BE%E6%A0%87_%E6%B8%B8%E9%82%A6%E8%80%85%E5%A4%8D%E5%88%BB.png',
      operators: [
        { id: 'char_4116_blkkgt', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '鐧', 'zh-CN': '锏', en: 'Degenbrecher' } },
        { id: 'char_194_leto', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '烈夏', 'zh-CN': '烈夏', en: 'Leto' } },
        { id: 'char_4122_grabds', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '小滿', 'zh-CN': '小满', en: 'Grain Buds' } },
      ],
      source_url: 'https://prts.wiki/w/%E9%93%B6%E5%BF%83%E6%B9%96%E5%88%97%E8%BD%A62024/%E6%B4%BB%E5%8A%A8%E5%85%AC%E5%91%8A',
    },
  ]),

  // Story-stage collaborations share this classification across every server.
  'wiki-a-flurry-to-the-flame': story(),
  'wiki-a-flurry-to-the-flame-rerun': story([
    {
      slug: 'sharpened-by-flames-rerun',
      kind: 'limited',
      name_i18n: { 'zh-TW': '烈火磨礪・復刻', 'zh-CN': '砺火成锋・复刻', en: 'Sharpened by Flames Rerun' },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/EN_Sharpened_by_Flame_banner.png',
      operators: [
        { id: 'char_1029_yato2', rarity: 6, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '麒麟R夜刀', 'zh-CN': '麒麟R夜刀', en: 'Kirin R Yato' } },
        { id: 'char_1030_noirc2', rarity: 5, featured: 'primary', limited: true, name_i18n: { 'zh-TW': '火龍S黑角', 'zh-CN': '火龙S黑角', en: 'Rathalos S Noir Corne' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/A_Flurry_to_the_Flame/Rerun',
    },
  ]),
  'wiki-delicious-on-terra': story(),
  'wiki-it-s-been-a-while': story([], { expectsRecruitmentPool: false }),
  'wiki-operation-lucent-arrowhead': story(),
  'wiki-operation-originium-dust': story(),
  'wiki-operation-originium-dust-rerun': story(),

  // Login campaigns, outfit promotions, and special modes are not story events.
  'wiki-among-the-luminaries': mini(),
  'wiki-an-accolade-to-a-rejuvenation': mini(),
  'wiki-display-of-auspices': mini(),
  'wiki-gyoko-kichion': mini(),
  'wiki-immemorial-bright': mini(),
  'wiki-kfc-collaboration': mini(),
  'wiki-languid-sentiment': mini(),
  'wiki-magic-and-friendship': mini(),
  'wiki-multivariate-cooperation-defence-protocols': mini(),
  'wiki-sweetness-overload': mini(),
  'wiki-tender-moments': mini(),
  'wiki-when-elegies-are-ashes-rerun': story([
    {
      slug: 'returned-from-a-pyre-rerun',
      kind: 'event',
      name_i18n: { 'zh-TW': '自餘燼歸來・復刻', 'zh-CN': '自余烬归来・复刻', en: 'Returned From A Pyre Rerun' },
      image_url: 'https://arknights.wiki.gg/wiki/Special:Redirect/file/CN_Returned_From_A_Pyre_Rerun_banner.png',
      operators: [
        { id: 'char_450_necras', rarity: 6, featured: 'primary', name_i18n: { 'zh-TW': '死芒', 'zh-CN': '死芒', en: 'Necrass' } },
        { id: 'char_4171_wulfen', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '鉬鉛', 'zh-CN': '钼铅', en: 'Wulfenite' } },
        { id: 'char_493_firwhl', rarity: 5, featured: 'primary', name_i18n: { 'zh-TW': '火哨', 'zh-CN': '火哨', en: 'Firewhistle' } },
      ],
      source_url: 'https://arknights.wiki.gg/wiki/When_Elegies_Are_Ashes/Rerun',
    },
  ]),
};

// Limited-event reruns reopen the stages but do not rerun their limited
// headhunting banner. PRTS and Wiki may expose the same CN event separately.
const NO_RECRUITMENT_POOL_CODES = new Set([
  'wiki-such-is-the-joy-of-our-reunion-rerun',
  'wiki-the-masses-travels-rerun',
  'wiki-i-portatori-dei-velluti-rerun',
  'wiki-adventure-that-cannot-wait-for-the-sun-rerun',
  'wiki-here-a-people-sows-rerun',
  'wiki-zwillingsturme-im-herbst-rerun',
  'wiki-so-long-adele-rerun',
  'wiki-lone-trail-rerun',
  'wiki-where-vernal-winds-will-never-blow-rerun',
  'wiki-il-siracusano-rerun',
  'wiki-stultifera-navis-rerun',
  'wiki-near-light-rerun',
  'wiki-dossoles-holiday-rerun',
  'wiki-under-tides-rerun',
  'wiki-who-is-real-rerun',
  'wiki-invitation-to-wine-rerun',
  'prts-123fgas',
  'prts-gsi0ix',
  'prts-hj2yk2',
  'prts-1mtlb0d',
  'prts-q1d0op',
  'prts-1yi0v88',
  'prts-3wyus0',
  'prts-fp6wsa',
  'prts-2u3jvs',
  'prts-5rwjcj',
  'prts-1afaaxs',
  'prts-fktx8u',
  'prts-111ilib',
  'prts-18ii387',
  'prts-dmz301',
  'prts-11o91xl',
  'prts-18otgzb',
  'prts-1eibk3p',
  'prts-1kcd030',
  'prts-v8thu5',
]);

export function getActivityClassification(activity) {
  return ACTIVITY_CATALOG[activity?.code]?.classification || null;
}

export function activityExpectsRecruitmentPool(activity) {
  return ACTIVITY_CATALOG[activity?.code]?.expectsRecruitmentPool !== false
    && !NO_RECRUITMENT_POOL_CODES.has(activity?.code);
}

function curatedPoolsFor(activity) {
  return ACTIVITY_CATALOG[activity?.code]?.recruitmentPools || [];
}

function normalizedIdentity(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function poolIdentities(pool) {
  return new Set([
    pool?.slug,
    pool?.id,
    ...Object.values(pool?.name_i18n || {}),
  ].map(normalizedIdentity).filter(Boolean));
}

function poolsMatch(left, right) {
  const leftIdentities = poolIdentities(left);
  return [...poolIdentities(right)].some((identity) => leftIdentities.has(identity));
}

function mergePool(apiPool, curatedPool) {
  return {
    ...curatedPool,
    ...apiPool,
    name_i18n: {
      ...curatedPool.name_i18n,
      ...apiPool.name_i18n,
    },
    image_url: apiPool.image_url || curatedPool.image_url,
    operators: apiPool.operators?.length ? apiPool.operators : curatedPool.operators,
  };
}

export function attachCuratedActivityRecruitmentPools(activities, server) {
  return (activities || []).map((activity) => {
    if (!activityExpectsRecruitmentPool(activity)) {
      return {
        ...activity,
        recruitment_pools: [],
        expects_recruitment_pool: false,
      };
    }
    const apiPools = Array.isArray(activity?.recruitment_pools)
      ? activity.recruitment_pools
      : [];
    // A date- and operator-based guess can associate an unrelated concurrent
    // banner with an activity. Only API data and catalog entries reviewed by
    // hand may be displayed as activity recruitment pools.
    const unmatchedCuratedPools = [...curatedPoolsFor(activity)];
    const mergedApiPools = apiPools.map((apiPool) => {
      const curatedIndex = unmatchedCuratedPools.findIndex((pool) => poolsMatch(apiPool, pool));
      if (curatedIndex < 0) return apiPool;
      const [curatedPool] = unmatchedCuratedPools.splice(curatedIndex, 1);
      return mergePool(apiPool, curatedPool);
    });
    const curatedPools = unmatchedCuratedPools.map((pool) => ({
        ...pool,
        id: `curated:${activity.code}:${server}:${pool.slug}`,
        activity_id: activity.id,
        server,
        start_at: activity.window?.start_at || null,
        end_at: activity.window?.end_at || null,
      }));

    return {
      ...activity,
      recruitment_pools: [...mergedApiPools, ...curatedPools],
      expects_recruitment_pool: activityExpectsRecruitmentPool(activity),
    };
  });
}
