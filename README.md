# 明日方舟音樂播放器 (Vue版本)

這是一個使用 Vue 3 框架重構的明日方舟音樂播放器項目。

## 項目結構

```
MonsterSirenWebpage-main/
├── src/
│   ├── components/          # Vue 組件
│   │   ├── Navbar.vue       # 頂部導覽列
│   │   ├── TopBar.vue       # 頂部工具欄（播放列和搜索）
│   │   ├── NowPlayingBar.vue # 當前播放列
│   │   ├── SearchBar.vue    # 搜索欄
│   │   ├── AlbumList.vue    # 專輯列表
│   │   ├── AlbumCard.vue    # 專輯卡片
│   │   ├── AlbumDetails.vue # 專輯詳情
│   │   ├── PlayerView.vue   # 播放器視圖
│   │   └── Modal.vue        # 模態框
│   ├── services/            # 服務層
│   │   ├── api.js          # API 調用
│   │   └── cache.js        # 緩存服務
│   ├── stores/             # 狀態管理
│   │   └── player.js       # 播放器狀態
│   ├── utils/              # 工具函數
│   │   ├── time.js         # 時間格式化
│   │   └── lyrics.js       # 歌詞解析
│   ├── App.vue             # 主應用組件
│   └── main.js             # 入口文件
├── public/
│   └── styles.css          # 全局樣式
├── index.html              # HTML 模板
├── package.json            # 項目配置
├── vite.config.js          # Vite 配置
└── README.md              # 說明文檔
```

## 功能特性

- 🎵 專輯瀏覽和搜索
- 🎶 音樂播放功能
- 📝 歌詞顯示和同步
- 📱 響應式設計
- 💾 緩存機制優化性能
- 🎨 現代化 UI 設計

## 安裝和運行

### 安裝依賴

```bash
npm install
```

### 開發模式

```bash
npm run dev
```

### 構建生產版本

```bash
npm run build
```

### 預覽生產版本

```bash
npm run preview
```

## 技術棧

- **Vue 3** - 前端框架
- **Vite** - 構建工具
- **Font Awesome** - 圖標庫

## 項目特點

1. **組件化設計**：功能模塊清晰分離，易於維護
2. **狀態管理**：使用 Vue 3 的 reactive API 進行狀態管理
3. **服務層分離**：API 調用和業務邏輯分離
4. **工具函數**：可復用的工具函數獨立管理
5. **響應式設計**：適配各種屏幕尺寸

## 開發說明

### 組件結構

- **Navbar**: 頂部導覽列
- **TopBar**: 包含播放列和搜索欄的頂部工具欄
- **AlbumList**: 專輯列表，支持無限滾動和搜索
- **Modal**: 模態框，用於顯示專輯詳情和播放器
- **PlayerView**: 播放器視圖，包含播放控制和歌詞顯示

### 狀態管理

所有狀態集中在 `src/stores/player.js` 中管理：
- `playerState`: 播放器相關狀態
- `albumState`: 專輯相關狀態
- `searchState`: 搜索相關狀態
- `modalState`: 模態框狀態
- `dropdownState`: 下拉列表狀態

### API 服務

所有 API 調用都在 `src/services/api.js` 中：
- `fetchAlbums()`: 獲取專輯列表
- `fetchAlbumDetails()`: 獲取專輯詳情
- `fetchSongs()`: 獲取歌曲列表
- `fetchSongDetails()`: 獲取歌曲詳情
- `fetchLyrics()`: 獲取歌詞

## 部署

本项目已配置 GitHub Pages 自动部署。每次推送到 main 分支时，GitHub Actions 会自动构建并部署网站。

网站地址：https://asriel0727.github.io/ArknightMusicWeb/

## 許可證

ISC
