#!/usr/bin/env node

import generatedActivityPools from '../src/data/generatedActivityPools.js';

const DEFAULT_SUPABASE_URL = 'https://rdneemerltoxlfosazcz.supabase.co';
const VALID_SERVERS = new Set(['cn', 'global', 'tw']);
const BATCH_SIZE = 50;

function parseArgs(argv) {
  const options = { dryRun: false, servers: new Set(), codes: new Set() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--server' && argv[index + 1]) options.servers.add(argv[++index]);
    else if (argument === '--code' && argv[index + 1]) options.codes.add(argv[++index]);
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  for (const server of options.servers) {
    if (!VALID_SERVERS.has(server)) throw new Error(`Invalid server: ${server}`);
  }
  return options;
}

function requiredEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required. Set it in your shell; do not commit it.`);
  return value;
}

function selectedEntries(options) {
  const result = [];
  for (const [activityCode, poolsByServer] of Object.entries(generatedActivityPools)) {
    if (options.codes.size && !options.codes.has(activityCode)) continue;
    for (const [server, pools] of Object.entries(poolsByServer || {})) {
      if (!VALID_SERVERS.has(server) || (options.servers.size && !options.servers.has(server))) continue;
      for (const pool of pools || []) result.push({ activityCode, server, pool });
    }
  }
  return result;
}

function identityFor(operator) {
  if (operator?.limited) return 'limited';
  return operator?.featured === 'secondary' ? 'off_banner' : 'featured';
}

function operatorRow(poolId, operator) {
  const id = String(operator?.id || '').trim();
  if (!id) return null;
  return {
    recruitment_pool_id: poolId,
    operator_id: id,
    identity: identityFor(operator),
    operator_data: {
      rarity: Number(operator.rarity) || 0,
      featured: operator.featured === 'secondary' ? 'secondary' : 'primary',
      limited: Boolean(operator.limited),
      name_i18n: operator.name_i18n || {},
    },
  };
}

function getPoolImage(pool) {
  return pool?.image_urls?.['zh-TW'] || pool?.image_urls?.en || pool?.image_url || null;
}

async function supabaseRequest(config, table, { method = 'GET', query = '', body, prefer } = {}) {
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(prefer ? { prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Supabase ${table} failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return [];
  // PostgREST returns 201 with an empty body when Prefer: return=minimal is
  // used. Treat it as a successful write instead of attempting JSON parsing.
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function fetchActivityWindows(config, servers) {
  const windows = new Map();
  for (const server of servers) {
    const rows = await supabaseRequest(config, 'activity_windows', {
      query: `?server=eq.${encodeURIComponent(server)}&select=activity_id,server,start_at,end_at,activities!inner(code,image_url)&order=start_at.desc&limit=5000`,
    });
    for (const row of rows || []) {
      const code = row.activities?.code;
      const key = `${code}:${server}`;
      // The API's activity codes represent an individual run. Keeping the
      // latest matching window makes re-running this sync idempotent.
      if (code && !windows.has(key)) windows.set(key, row);
    }
  }
  return windows;
}

async function writeBatches(config, table, rows, query, prefer) {
  const savedRows = [];
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const result = await supabaseRequest(config, table, {
      method: 'POST',
      query,
      prefer,
      body: rows.slice(offset, offset + BATCH_SIZE),
    });
    savedRows.push(...result);
  }
  return savedRows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = selectedEntries(options);
  if (!entries.length) throw new Error('No generated activity pools matched the requested filters.');

  const servers = [...new Set(entries.map((entry) => entry.server))];
  if (options.dryRun) {
    const withoutOperatorIds = entries.flatMap(({ activityCode, server, pool }) => (pool.operators || [])
      .filter((operator) => !operator.id)
      .map((operator) => `${activityCode}:${server}:${pool.slug} → ${operator.name_i18n?.en || 'unknown'}`));
    console.log(JSON.stringify({ dryRun: true, pools: entries.length, servers, withoutOperatorIds }, null, 2));
    return;
  }

  const config = {
    url: String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, ''),
    key: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  };
  const windows = await fetchActivityWindows(config, servers);
  const missingActivities = [];
  const poolRows = [];
  const poolInputByKey = new Map();
  const now = new Date().toISOString();
  for (const entry of entries) {
    const window = windows.get(`${entry.activityCode}:${entry.server}`);
    if (!window) {
      missingActivities.push(`${entry.activityCode}:${entry.server}`);
      continue;
    }
    const key = `${window.activity_id}:${entry.server}:${entry.pool.slug}`;
    poolInputByKey.set(key, entry.pool);
    poolRows.push({
      activity_id: window.activity_id,
      slug: entry.pool.slug,
      kind: entry.pool.kind,
      name_i18n: entry.pool.name_i18n || {},
      image_url: getPoolImage(entry.pool) || window.activities?.image_url || null,
      server: entry.server,
      start_at: window.start_at,
      end_at: window.end_at || null,
      source_url: entry.pool.source_url || null,
      updated_at: now,
    });
  }
  if (missingActivities.length) {
    console.warn(`Skipped ${missingActivities.length} pools whose activity window is not yet in Supabase.`);
    for (const key of missingActivities) console.warn(`  ${key}`);
  }
  if (!poolRows.length) throw new Error('None of the generated pools had a matching Supabase activity window. Sync activities first.');

  const savedPools = await writeBatches(
    config,
    'recruitment_pools',
    poolRows,
    '?on_conflict=activity_id,server,slug',
    'resolution=merge-duplicates,return=representation',
  );

  const poolIds = new Map();
  for (const saved of savedPools) {
    if (!saved?.id) throw new Error('Supabase did not return a recruitment pool id.');
    poolIds.set(`${saved.activity_id}:${saved.server}:${saved.slug}`, saved.id);
  }

  const operatorRows = [];
  for (const [key, pool] of poolInputByKey) {
    const poolId = poolIds.get(key);
    if (!poolId) throw new Error(`Unable to match the saved recruitment pool: ${pool.slug}`);
    for (const operator of pool.operators || []) {
      const row = operatorRow(poolId, operator);
      if (row) operatorRows.push(row);
    }
  }
  await writeBatches(
    config,
    'recruitment_pool_operators',
    operatorRows,
    '?on_conflict=recruitment_pool_id,operator_id,identity',
    'resolution=merge-duplicates,return=minimal',
  );

  console.log(JSON.stringify({
    syncedPools: poolRows.length,
    syncedOperators: operatorRows.length,
    skippedMissingActivities: missingActivities.length,
    servers,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Activity pool push failed: ${error.message}`);
  process.exitCode = 1;
});
