const PRTS_MUSIC_URL = 'https://prts.wiki/w/%E8%A1%8D%E7%94%9F%E4%BD%9C%E5%93%81/%E9%9F%B3%E4%B9%90';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract PRTS EP rows that explicitly list one or more MV characters.
 * The page is server-rendered MediaWiki HTML, so using its table headers is
 * less brittle than relying on the position of a year section.
 */
export async function getPrtsCharacterEpEntries(page) {
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
  if (!loaded) throw new Error(`PRTS music page could not be loaded after 3 attempts: ${lastError?.message || 'unknown error'}`);

  return page.locator('table').evaluateAll((tables) => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const entries = [];

    for (const table of tables) {
      const headerCells = [...table.querySelectorAll('tr')]
        .map((row) => [...row.querySelectorAll('th')].map((cell) => clean(cell.textContent)));
      const header = headerCells.find((cells) => cells.includes('MV角色') && cells.includes('标题'));
      if (!header) continue;

      const titleIndex = header.indexOf('标题');
      const characterIndex = header.indexOf('MV角色');
      for (const row of table.querySelectorAll('tr')) {
        const cells = [...row.querySelectorAll(':scope > td')];
        if (cells.length <= Math.max(titleIndex, characterIndex)) continue;

        const mvCharacters = clean(cells[characterIndex].textContent);
        if (!mvCharacters || mvCharacters === '-') continue;

        const titleCell = cells[titleIndex];
        const titleText = clean(titleCell.textContent);
        const songPageUrl = [...titleCell.querySelectorAll('a')]
          .map((link) => link.href)
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
        ].filter((title) => title.length >= 2))];
        if (!titles.length) continue;

        entries.push({ titleText, titles, mvCharacters, songPageUrl });
      }
    }

    return entries;
  });
}

export { PRTS_MUSIC_URL, cleanText };
