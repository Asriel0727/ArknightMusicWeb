import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function createKv() {
  const values = new Map();
  return {
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function createEnv() {
  return {
    ARKNIGHTS_DATA: createKv(),
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
}

async function call(workerEnv, path, options = {}) {
  const request = new Request(`https://worker.example${path}`, {
    ...options,
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      ...(options.headers || {}),
    },
  });
  const response = await worker.fetch(request, workerEnv, { waitUntil() {} });
  return { response, data: await response.json() };
}

async function hashPasswordForTest(password, salt, iterations = 100000) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations,
    },
    keyMaterial,
    256
  );
  return Buffer.from(bits).toString('base64url');
}

async function getSessionKeyForTest(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return `userSession:v1:${Buffer.from(digest).toString('hex')}`;
}

test('new accounts require a stronger password and do not request an upgrade', async () => {
  const env = createEnv();
  const weak = await call(env, '/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ loginKey: 'doctor_01', password: 'short' }),
  });
  assert.equal(weak.response.status, 400);

  const tooLong = await call(env, '/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ loginKey: 'doctor_01', password: 'Abc!234567890' }),
  });
  assert.equal(tooLong.response.status, 400);

  const created = await call(env, '/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ loginKey: 'doctor_01', password: 'Abc!2345' }),
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.data.session.user.passwordUpgradeRequired, false);
});

test('sign-out revokes the server-side session', async () => {
  const env = createEnv();
  const created = await call(env, '/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ loginKey: 'doctor_02', password: 'Abc!2345' }),
  });
  const token = created.data.session.access_token;

  const signedOut = await call(env, '/api/auth/sign-out', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(signedOut.response.status, 200);

  const currentUser = await call(env, '/api/auth/user', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(currentUser.response.status, 401);
});

test('password updates revoke the old session and clear the upgrade requirement', async () => {
  const env = createEnv();
  const created = await call(env, '/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ loginKey: 'doctor_04', password: 'Abc!2345' }),
  });
  const oldToken = created.data.session.access_token;

  const changed = await call(env, '/api/auth/change-password', {
    method: 'POST',
    headers: { authorization: `Bearer ${oldToken}` },
    body: JSON.stringify({ currentPassword: 'Abc!2345', newPassword: 'Xy!12345' }),
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.data.session.user.passwordUpgradeRequired, false);

  const oldSession = await call(env, '/api/auth/user', {
    headers: { authorization: `Bearer ${oldToken}` },
  });
  assert.equal(oldSession.response.status, 401);
});

test('legacy accounts can update to an 8-12 character password', async () => {
  const env = createEnv();
  const loginKey = 'legacy_doctor';
  const currentPassword = 'legacy1';
  const token = 'legacy-session-token';
  const salt = 'legacy-test-salt';
  await env.ARKNIGHTS_DATA.put(`userAccount:v1:${loginKey}`, JSON.stringify({
    id: 'legacy-user-id',
    loginKey,
    createdAt: '2026-01-01T00:00:00.000Z',
    salt,
    passwordHash: await hashPasswordForTest(currentPassword, salt),
  }));
  await env.ARKNIGHTS_DATA.put(await getSessionKeyForTest(token), JSON.stringify({
    access_token: token,
    user: { id: 'legacy-user-id', loginKey, createdAt: '2026-01-01T00:00:00.000Z' },
  }));

  const changed = await call(env, '/api/auth/change-password', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword: 'New!2345' }),
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.data.session.user.passwordUpgradeRequired, false);

  const signedIn = await call(env, '/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ loginKey, password: 'New!2345' }),
  });
  assert.equal(signedIn.response.status, 200);
});

test('sign-in is rate limited after repeated failed attempts', async () => {
  const env = createEnv();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await call(env, '/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ loginKey: 'doctor_03', password: 'wrong-password' }),
    });
    assert.equal(result.response.status, 401);
  }

  const blocked = await call(env, '/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ loginKey: 'doctor_03', password: 'wrong-password' }),
  });
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.data.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
});
