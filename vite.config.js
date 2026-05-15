import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages 部署配置
// 如果你的 GitHub 仓库名是 username.github.io，base 应该是 '/'
// 如果仓库名是其他名称（例如：MonsterSirenWebpage），base 应该是 '/MonsterSirenWebpage/'
// ⚠️ 重要：请根据你的实际 GitHub 仓库名修改下面的 base 值（包括大小写必须完全匹配）
export default defineConfig({
  plugins: [vue()],
  // GitHub 仓库名：ArknightMusicWeb
  base: process.env.NODE_ENV === 'production' ? '/ArknightMusicWeb/' : '/',
  server: {
    port: 3000,
    // 3000 被占用時自動改用下一個可用埠（終端機會印出實際網址）
    strictPort: false,
    open: true
  }
})

