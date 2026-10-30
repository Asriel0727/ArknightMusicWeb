const PASSWORD_HASH_VERSION = 2;
const PASSWORD_ITERATIONS = 100000;
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
const MAX_SESSIONS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS }, material, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function equalHash(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function tokenAccountId(token) {
  return /^v2\.([a-f0-9]{64})\.[A-Za-z0-9_-]{43}$/.exec(token || '')?.[1] || '';
}

export function validateCredentials(loginKey, password, isNew = false) {
  if (typeof loginKey !== 'string' || !/^[a-z0-9_-]{3,32}$/.test(loginKey)) return 'INVALID_LOGIN_KEY';
  if (typeof password !== 'string' || password.length < (isNew ? 8 : 6) || password.length > 128) {
    return isNew ? 'INVALID_NEW_PASSWORD' : 'INVALID_CREDENTIALS';
  }
  return '';
}

function publicUser(account) {
  return { id: account.id, loginKey: account.loginKey, createdAt: account.createdAt, passwordUpgradeRequired: account.passwordHashVersion < PASSWORD_HASH_VERSION };
}

function failure(code, status = 401) {
  return { ok: false, status, code, error: code };
}

// Synchronous SQLite operations keep each check and write in one transaction.
// Password hashing and legacy KV reads happen outside transactions; commits
// recheck the credential version so concurrent password changes cannot be lost.
export class SqlAuthStore {
  constructor(storage) {
    this.storage = storage;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS auth_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  get(key) {
    const row = this.storage.sql.exec('SELECT value FROM auth_state WHERE key = ?', key).toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }

  put(key, value) {
    this.storage.sql.exec('INSERT INTO auth_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }

  transaction(callback) {
    return this.storage.transactionSync(callback);
  }
}

export class AuthController {
  constructor(store, env) {
    this.store = store;
    this.env = env;
  }

  consumeRateLimit(limit, windowSeconds, key = 'rate') {
    return this.store.transaction(() => {
      const now = Date.now();
      const previous = this.store.get(key);
      const record = previous?.resetAt > now ? previous : { count: 0, resetAt: now + windowSeconds * 1000 };
      if (record.count >= limit) return { blocked: true, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) };
      this.store.put(key, { ...record, count: record.count + 1 });
      return { blocked: false };
    });
  }

  async loadAccount(loginKey) {
    const stored = this.store.get('account');
    if (stored) return stored;
    const legacy = await this.env.ARKNIGHTS_DATA.get(`userAccount:v1:${loginKey}`, 'json');
    if (!legacy || legacy.loginKey !== loginKey || !legacy.id || !legacy.passwordHash || !legacy.salt) return null;
    return this.store.transaction(() => {
      const current = this.store.get('account');
      if (current) return current;
      const migrated = { ...legacy, passwordHashVersion: legacy.passwordHashVersion || 1, sessionVersion: 1 };
      this.store.put('account', migrated);
      return migrated;
    });
  }

  async prepareSession(account) {
    const token = `v2.${await sha256(account.loginKey)}.${randomToken(32)}`;
    return { token, hash: await sha256(token), expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  }

  saveSession(account, prepared, revokeOthers = false) {
    const sessions = revokeOthers ? [] : (this.store.get('sessions') || []).filter(session => session.expiresAt > Date.now() / 1000);
    sessions.push({ hash: prepared.hash, expiresAt: prepared.expiresAt, version: account.sessionVersion });
    this.store.put('sessions', sessions.slice(-MAX_SESSIONS));
    return { access_token: prepared.token, token_type: 'bearer', expires_in: SESSION_TTL_SECONDS, expires_at: prepared.expiresAt, user: publicUser(account) };
  }

  async signUp(loginKey, password) {
    const code = validateCredentials(loginKey, password, true);
    if (code) return failure(code, 400);
    if (await this.loadAccount(loginKey)) return failure('LOGIN_KEY_TAKEN', 409);
    const salt = randomToken(16);
    const account = { id: crypto.randomUUID(), loginKey, createdAt: new Date().toISOString(), salt, passwordHash: await hashPassword(password, salt), passwordHashVersion: PASSWORD_HASH_VERSION, sessionVersion: 1 };
    const prepared = await this.prepareSession(account);
    return this.store.transaction(() => {
      if (this.store.get('account')) return failure('LOGIN_KEY_TAKEN', 409);
      this.store.put('account', account);
      return { ok: true, session: this.saveSession(account, prepared) };
    });
  }

  async signIn(loginKey, password) {
    const code = validateCredentials(loginKey, password);
    if (code) return failure(code, 400);
    const limited = this.consumeRateLimit(6, LOGIN_WINDOW_SECONDS, 'login-rate');
    if (limited.blocked) return { ...failure('RATE_LIMITED', 429), retryAfter: limited.retryAfter };
    const account = await this.loadAccount(loginKey);
    if (!account) return failure('INVALID_CREDENTIALS');
    const hash = await hashPassword(password, account.salt);
    if (!equalHash(hash, account.passwordHash)) return failure('INVALID_CREDENTIALS');
    const prepared = await this.prepareSession(account);
    const result = this.store.transaction(() => {
      const current = this.store.get('account');
      if (current.passwordHash !== account.passwordHash || current.sessionVersion !== account.sessionVersion) return failure('INVALID_CREDENTIALS');
      return { ok: true, session: this.saveSession(current, prepared) };
    });
    // Remove the obsolete credential copy only after a successful migration/login.
    if (result.ok) await this.env.ARKNIGHTS_DATA.delete(`userAccount:v1:${loginKey}`).catch(() => {});
    return result;
  }

  verifiedSession(hash) {
    const account = this.store.get('account');
    const session = (this.store.get('sessions') || []).find(item => item.hash === hash);
    return account && session?.expiresAt > Date.now() / 1000 && session.version === account.sessionVersion ? account : null;
  }

  async verifySession(token) {
    if (!tokenAccountId(token)) return failure('SESSION_EXPIRED');
    const account = this.verifiedSession(await sha256(token));
    return account ? { ok: true, user: publicUser(account) } : failure('SESSION_EXPIRED');
  }

  async signOut(token) {
    const hash = await sha256(token);
    return this.store.transaction(() => {
      this.store.put('sessions', (this.store.get('sessions') || []).filter(session => session.hash !== hash));
      return { ok: true };
    });
  }

  async changePassword(token, currentPassword, newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) return failure('INVALID_NEW_PASSWORD', 400);
    const tokenHash = await sha256(token);
    const account = this.verifiedSession(tokenHash);
    if (!account) return failure('SESSION_EXPIRED');
    const limited = this.consumeRateLimit(6, LOGIN_WINDOW_SECONDS, 'password-rate');
    if (limited.blocked) return { ...failure('RATE_LIMITED', 429), retryAfter: limited.retryAfter };
    if (typeof currentPassword !== 'string' || currentPassword.length > 128 || !equalHash(await hashPassword(currentPassword, account.salt), account.passwordHash)) return failure('INVALID_CURRENT_PASSWORD');
    const salt = randomToken(16);
    const updated = { ...account, salt, passwordHash: await hashPassword(newPassword, salt), passwordHashVersion: PASSWORD_HASH_VERSION, sessionVersion: account.sessionVersion + 1 };
    const prepared = await this.prepareSession(updated);
    return this.store.transaction(() => {
      const current = this.verifiedSession(tokenHash);
      if (!current || current.sessionVersion !== account.sessionVersion || current.passwordHash !== account.passwordHash) return failure('SESSION_EXPIRED');
      this.store.put('account', updated);
      return { ok: true, session: this.saveSession(updated, prepared, true) };
    });
  }
}
