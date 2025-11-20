<template>
  <nav class="main-navbar">
    <div class="navbar-left">
      <div class="page-title">塞壬唱片專輯一覽</div>
    </div>
    <div class="navbar-right">
      <img :src="`${baseUrl}logo.png`" alt="明日方舟" class="logo-img" />
    </div>
  </nav>
</template>

<script setup>
// 使用 Vite 的 BASE_URL 来支持 GitHub Pages 的 base 路径
const baseUrl = import.meta.env.BASE_URL;
</script>

<style scoped>
.main-navbar {
  width: 100%;
  background: var(--card-bg);
  border-radius: 0 0 32px 32px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 40px 16px 40px;
  margin-bottom: 18px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow-x: auto;
}

.page-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-color);
}

.logo-img {
  height: 40px;
  width: auto;
  object-fit: contain;
  display: block;
}

.logo-btn {
  background: var(--primary-color);
  color: #fff;
  font-weight: 600;
  font-size: 1.1rem;
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  border: none;
}

@media (max-width: 900px) {
  .main-navbar {
    padding-left: 15px;
    padding-right: 15px;
    gap: 8px;
  }
  .page-title {
    padding: 7px 14px;
    font-size: 0.98rem;
  }
  .logo-img {
    height: 35px;
  }
}

@media (max-width: 600px) {
  .main-navbar {
    padding: 8px 2px 6px 2px;
  }
  .page-title {
    padding: 4px 7px;
    font-size: 0.85rem;
  }
  .logo-img {
    height: 30px;
  }
}
</style>

