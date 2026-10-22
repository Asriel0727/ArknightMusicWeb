const PRTS_MUSIC_URL = 'https://prts.wiki/w/%E8%A1%8D%E7%94%9F%E4%BD%9C%E5%93%81/%E9%9F%B3%E4%B9%90';
const PRTS_MUSIC_PAGE_TITLE = '衍生作品/音乐';
const PRTS_MUSIC_API_URL = `https://prts.wiki/api.php?action=parse&format=json&formatversion=2&prop=text&redirects=1&page=${encodeURIComponent(PRTS_MUSIC_PAGE_TITLE)}`;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract all PRTS music rows that have a linked song page.
 * `MV角色` is retained as metadata, but it is not used as an eligibility
 * filter because some valid Bilibili-backed music pages leave that column as
 * `-` or blank.
 */
export async function getPrtsMusicEntries(page) {
  let loaded = false;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // PRTS can keep non-essential scripts open long after its server-rendered
      // table is available. Waiting for `domcontentloaded` makes a successful
      // data response look like a failed sync on GitHub-hosted runners.
      const response = await page.goto(PRTS_MUSIC_URL, { waitUntil: 'commit', timeout: 90_000 });
      if (!response?.ok()) throw new Error(`PRTS music page returned ${response?.status() || 'no response'}`);
      await page.locator('table').first().waitFor({ state: 'attached', timeout: 30_000 });
      loaded = true;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(attempt * 2_000);
    }
  }

  if (!loaded) {
    // GitHub-hosted runners can receive the PRTS document successfully while
    // its table is withheld by the site edge or never rendered by the page
    // scripts. MediaWiki's parse endpoint returns the same article HTML without
    // depending on that browser-side rendering path.
    let apiError;
    try {
      const response = await fetch(PRTS_MUSIC_API_URL, {
        headers: {
          accept: 'application/json',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'user-agent': 'ArknightMusicWeb character EP sync/1.0',
        },
      });
      if (!response.ok) throw new Error(`MediaWiki API returned ${response.status}`);
      const payload = await response.json();
      const html = typeof payload?.parse?.text === 'string'
        ? payload.parse.text
        : payload?.parse?.text?.['*'];
      if (!html || !/<table\b/i.test(html)) {
        throw new Error('MediaWiki API response did not contain a music table');
      }
      await page.setContent(`<base href="${PRTS_MUSIC_URL}">${html}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.locator('table').first().waitFor({ state: 'attached', timeout: 30_000 });
      loaded = true;
    } catch (error) {
      apiError = error;
    }
    if (!loaded) {
      throw new Error(
        `PRTS music page and MediaWiki API could not be loaded: page=${lastError?.message || 'unknown error'}; api=${apiError?.message || 'unknown error'}`
      );
    }
    console.warn('PRTS music page table was unavailable; used MediaWiki API fallback.');
  }

  return page.locator('table').evaluateAll((tables, baseUrl) => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const splitMixedTitle = (value) => clean(value)
      // PRTS sometimes concatenates a Japanese/Chinese title and its English
      // title without a separator, e.g. `碧い瞳の中にin your blue eyes`.
      .replace(/([\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff])([A-Za-z])/g, '$1|$2')
      .replace(/([A-Za-z])([\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff])/g, '$1|$2')
      .split('|')
      .map(clean)
      .filter((title) => title.length >= 2);
    const entries = [];

    for (const table of tables) {
      const headerCells = [...table.querySelectorAll('tr')]
        .map((row) => [...row.querySelectorAll('th')].map((cell) => clean(cell.textContent)));
      const header = headerCells.find((cells) => cells.includes('标题') && cells.includes('艺术家'));
      if (!header) continue;

      const titleIndex = header.indexOf('标题');
      const characterIndex = header.indexOf('MV角色');
      for (const row of table.querySelectorAll('tr')) {
        const cells = [...row.querySelectorAll(':scope > td')];
        if (titleIndex < 0 || cells.length <= titleIndex) continue;

        const mvCharacters = characterIndex >= 0
          ? clean(cells[characterIndex]?.textContent)
          : '';

        const titleCell = cells[titleIndex];
        const titleText = clean(titleCell.textContent);
        const songPageUrl = [...titleCell.querySelectorAll('a')]
          .map((link) => link.getAttribute('href'))
          .map((href) => {
            if (!href) return '';
            try {
              return new URL(href, baseUrl).href;
            } catch {
              return '';
            }
          })
          .find((href) => {
            try {
              return new URL(href).pathname.startsWith('/w/');
            } catch {
              return false;
            }
          }) || '';
        const titles = [...new Set([
          titleText,
          ...[...titleCell.querySelectorAll('a')].map((link) => clean(link.textContent)),
          ...titleText.split(/[／/|｜\n]/).map(clean),
          ...splitMixedTitle(titleText),
        ].filter((title) => title.length >= 2))];
        if (!titles.length) continue;

        entries.push({
          titleText,
          titles,
          mvCharacters: mvCharacters === '-' ? '' : mvCharacters,
          songPageUrl,
        });
      }
    }

    return entries;
  }, PRTS_MUSIC_URL);
}

export { PRTS_MUSIC_API_URL, PRTS_MUSIC_URL, cleanText };
