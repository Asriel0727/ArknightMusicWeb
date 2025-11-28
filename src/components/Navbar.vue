<template>
  <nav class="main-navbar">
    <div class="navbar-left">
      <div class="nav-tabs">
        <button 
          class="nav-tab" 
          :class="{ active: currentPage === 'albums' }"
          @click="changePage('albums')"
        >
          <i class="fas fa-compact-disc"></i>
          <span>塞壬唱片</span>
        </button>
        <button 
          class="nav-tab" 
          :class="{ active: currentPage === 'characters' }"
          @click="changePage('characters')"
        >
          <i class="fas fa-users"></i>
          <span>幹員圖鑑</span>
        </button>
      </div>
    </div>
    <div class="navbar-right">
      <img :src="`${baseUrl}logo.png`" alt="明日方舟" class="logo-img" />
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue';

// 使用 Vite 的 BASE_URL 来支持 GitHub Pages 的 base 路径
const baseUrl = import.meta.env.BASE_URL;

const props = defineProps({
  currentPage: {
    type: String,
    default: 'albums'
  }
});

const emit = defineEmits(['change-page']);

const changePage = (page) => {
  emit('change-page', page);
};
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
  padding: 16px 40px;
  margin-bottom: 18px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow-x: auto;
}

.navbar-left {
  display: flex;
  align-items: center;
}

.nav-tabs {
  display: flex;
  gap: 8px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.nav-tab:hover {
  color: var(--text-color);
  background: rgba(88, 166, 255, 0.1);
}

.nav-tab.active {
  color: var(--primary-color);
  background: rgba(88, 166, 255, 0.15);
  border-color: var(--primary-color);
}

.nav-tab i {
  font-size: 1.1rem;
}

.logo-img {
  height: 40px;
  width: auto;
  object-fit: contain;
  display: block;
}

@media (max-width: 900px) {
  .main-navbar {
    padding: 12px 15px;
    gap: 8px;
  }
  
  .nav-tab {
    padding: 8px 14px;
    font-size: 0.9rem;
  }
  
  .nav-tab i {
    font-size: 1rem;
  }
  
  .logo-img {
    height: 35px;
  }
}

@media (max-width: 600px) {
  .main-navbar {
    padding: 10px 10px;
    border-radius: 0 0 20px 20px;
  }
  
  .nav-tab {
    padding: 8px 12px;
    font-size: 0.8rem;
    gap: 6px;
  }
  
  .nav-tab span {
    display: none;
  }
  
  .nav-tab i {
    font-size: 1.2rem;
  }
  
  .logo-img {
    height: 30px;
  }
}
</style>
