<template>
  <main class="auth-page">
    <section class="auth-panel">
      <div class="auth-header">
        <h1>帳號</h1>
        <p>登入後可以同步我的最愛、歌單與角色清單。不登入也可以照常使用播放器與查看角色資料。</p>
      </div>

      <div v-if="authState.user" class="signed-in-panel">
        <span>目前登入：{{ authState.user.loginKey }}</span>
        <button class="auth-submit secondary" type="button" @click="signOut">登出</button>
      </div>

      <template v-else>
        <div class="auth-mode-tabs">
          <button
            type="button"
            :class="{ active: mode === 'sign-in' }"
            @click="mode = 'sign-in'"
          >
            登入
          </button>
          <button
            type="button"
            :class="{ active: mode === 'sign-up' }"
            @click="mode = 'sign-up'"
          >
            註冊
          </button>
        </div>

        <form class="auth-form" @submit.prevent="handleSubmit">
          <label>
            <span>帳號</span>
            <input
              v-model.trim="loginKey"
              autocomplete="username"
              placeholder="例如 Example01"
            >
          </label>
          <label>
            <span>密碼</span>
            <input
              v-model="password"
              autocomplete="current-password"
              type="password"
              placeholder="至少 6 個字"
            >
          </label>
          <p class="auth-hint">帳號只能使用英文小寫、數字、底線與減號，長度 3-32。</p>
          <p v-if="authState.error" class="auth-error">{{ authState.error }}</p>
          <button class="auth-submit" type="submit" :disabled="authState.isLoading">
            {{ mode === 'sign-in' ? '登入' : '註冊' }}
          </button>
        </form>
      </template>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue';
import { authState, signIn, signOut, signUp } from '../services/auth.js';

const mode = ref('sign-in');
const loginKey = ref('');
const password = ref('');

const handleSubmit = async () => {
  if (mode.value === 'sign-in') {
    await signIn(loginKey.value, password.value).catch(() => {});
    return;
  }

  await signUp(loginKey.value, password.value).catch(() => {});
};
</script>

<style scoped>
.auth-page {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 20px;
}

.auth-panel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
}

.auth-header h1 {
  margin: 0 0 8px;
  color: var(--primary-color);
}

.auth-header p,
.auth-hint {
  color: var(--text-secondary);
  line-height: 1.6;
}

.auth-mode-tabs {
  display: flex;
  gap: 8px;
  margin: 18px 0;
}

.auth-mode-tabs button,
.auth-submit {
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  background: transparent;
  color: var(--primary-color);
  padding: 9px 14px;
  cursor: pointer;
}

.auth-mode-tabs button.active,
.auth-submit {
  background: var(--primary-color);
  color: #111;
}

.auth-form {
  display: grid;
  gap: 14px;
}

.auth-form label {
  display: grid;
  gap: 6px;
  color: var(--text-color);
}

.auth-form input {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color);
  padding: 10px 12px;
}

.auth-error {
  color: #ff7b72;
}

.signed-in-panel {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  color: var(--text-color);
}

.auth-submit.secondary {
  background: transparent;
  color: var(--primary-color);
}
</style>
