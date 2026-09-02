import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseHeaders } from '../scripts/supabase-headers.mjs';

test('new Supabase secret keys use apikey only', () => {
  const headers = getSupabaseHeaders('  sb_secret_test  ', {
    authorization: 'Bearer stale-key',
    Authorization: 'Bearer stale-key',
    'content-type': 'application/json',
  });

  assert.equal(headers.apikey, 'sb_secret_test');
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers['content-type'], 'application/json');
});

test('legacy service role keys keep the Bearer header', () => {
  const headers = getSupabaseHeaders('eyJlegacy-service-role');

  assert.equal(headers.apikey, 'eyJlegacy-service-role');
  assert.equal(headers.authorization, 'Bearer eyJlegacy-service-role');
});
