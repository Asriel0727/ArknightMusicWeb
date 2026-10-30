import { DurableObject } from 'cloudflare:workers';
import worker from './index.js';
import { AuthController, SqlAuthStore } from './auth-state.js';

export class AuthState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.auth = new AuthController(new SqlAuthStore(ctx.storage), env);
  }

  signUp(loginKey, password) { return this.auth.signUp(loginKey, password); }
  signIn(loginKey, password) { return this.auth.signIn(loginKey, password); }
  verifySession(token) { return this.auth.verifySession(token); }
  signOut(token) { return this.auth.signOut(token); }
  changePassword(token, currentPassword, newPassword) { return this.auth.changePassword(token, currentPassword, newPassword); }
  consumeRateLimit(limit, windowSeconds) { return this.auth.consumeRateLimit(limit, windowSeconds); }
}

export default worker;
