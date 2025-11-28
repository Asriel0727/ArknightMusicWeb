# 明日方舟音樂播放器 (Vue版本)

這是一個使用 Vue 3 框架重構的明日方舟音樂播放器項目。

## 項目結構

```
ArknightMusicWeb/
├── src/
│   ├── components/          # Vue 組件
│   │   ├── Navbar.vue       # 頂部導覽列（支援頁面切換）
│   │   ├── TopBar.vue       # 頂部工具欄（播放列和搜索）
│   │   ├── NowPlayingBar.vue # 當前播放列
│   │   ├── SearchBar.vue    # 搜索欄
│   │   ├── AlbumList.vue    # 專輯列表
│   │   ├── AlbumCard.vue    # 專輯卡片
│   │   ├── AlbumDetails.vue # 專輯詳情
│   │   ├── PlayerView.vue   # 播放器視圖
│   │   ├── CharacterList.vue # 幹員列表
│   │   ├── CharacterDetails.vue # 幹員詳情
│   │   ├── ParticleBackground.vue # 粒子背景動畫
│   │   └── Modal.vue        # 模態框（支援專輯、播放器、幹員詳情）
│   ├── services/            # 服務層
│   │   ├── api.js          # API 調用（包含音樂和幹員 API）
│   │   └── cache.js        # 緩存服務
│   ├── stores/             # 狀態管理
│   │   └── player.js       # 播放器狀態
│   ├── utils/              # 工具函數
│   │   ├── time.js         # 時間格式化
│   │   ├── lyrics.js       # 歌詞解析
│   │   └── textGlitch.js   # 文字亂碼動畫工具
│   ├── directives/         # Vue 指令
│   │   └── textGlitch.js   # 文字亂碼動畫指令
│   ├── composables/        # 組合式函數
│   │   └── useTextGlitch.js # 文字亂碼動畫組合式函數
│   ├── App.vue             # 主應用組件
│   └── main.js             # 入口文件
├── public/
│   ├── images/             # 圖片資源
│   └── logo.png            # Logo
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions 部署配置
├── index.html              # HTML 模板
├── package.json            # 項目配置
├── vite.config.js          # Vite 配置
├── vercel.json             # Vercel 部署配置
├── DEPLOY.md               # 部署指南
└── README.md              # 說明文檔
```

## 功能特性

### 音樂播放功能
- 🎵 專輯瀏覽和搜索
- 🎶 音樂播放功能
- 📝 歌詞顯示和同步（支援高頻率同步，手動滾動時仍保持同步）
- 🖱️ 點擊正在播放的音樂標題打開播放器視圖
- 📋 下拉式選單支持快速切換歌曲
- 🎯 智能分頁系統（每頁顯示適量專輯）

### 幹員圖鑑功能
- 👥 完整的幹員列表瀏覽
- 🔍 多條件篩選（稀有度多選、職業篩選、名稱搜索）
- 📊 詳細的幹員資料顯示：
  - 幹員立繪（精一、精二）
  - 特性說明
  - 獲得方式
  - 屬性數值（各精英階段）
  - 攻擊範圍視覺化
  - 天賦詳情
  - 潛能提升效果
  - 技能詳情（含 SP 消耗、持續時間等）
  - 後勤技能
  - 精英化材料（含材料圖片和名稱）
  - 技能升級材料（含材料圖片和名稱）
  - 模組資訊
  - 幹員檔案
- 🖼️ 多來源圖片備援機制（自動切換圖片來源）
- 📱 響應式設計，完美適配手機和桌面

### 其他功能
- 📱 響應式設計
- 💾 緩存機制優化性能
- 🎨 現代化 UI 設計
- ✨ 文字亂碼動畫效果（頁面加載時文字從亂碼逐漸解碼）
- 🖱️ 觸控設備優化（自動隱藏滑鼠特效）
- 🚀 GitHub Pages 自動部署

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
6. **文字動畫效果**：獨特的亂碼解碼動畫，增強視覺體驗
7. **GitHub Pages 部署**：自動化部署流程，支持 GitHub Pages

## 開發說明

### 組件結構

**音樂播放相關：**
- **Navbar**: 頂部導覽列（支援切換音樂和幹員圖鑑頁面）
- **TopBar**: 包含播放列和搜索欄的頂部工具欄
- **AlbumList**: 專輯列表，支持無限滾動和搜索
- **AlbumDetails**: 專輯詳情頁面
- **Modal**: 模態框，用於顯示專輯詳情、播放器和幹員詳情
- **PlayerView**: 播放器視圖，包含播放控制和歌詞顯示

**幹員圖鑑相關：**
- **CharacterList**: 幹員列表頁面，包含篩選和搜索功能
- **CharacterDetails**: 幹員詳情頁面，顯示完整的幹員資料

### 狀態管理

所有狀態集中在 `src/stores/player.js` 中管理：
- `playerState`: 播放器相關狀態
- `albumState`: 專輯相關狀態
- `searchState`: 搜索相關狀態
- `modalState`: 模態框狀態（支援 'album'、'player'、'character' 三種視圖）
- `dropdownState`: 下拉列表狀態
- `characterState`: 幹員相關狀態（包含當前查看的幹員詳情）

### API 服務

所有 API 調用都在 `src/services/api.js` 中：

**音樂相關 API：**
- `fetchAlbums()`: 獲取專輯列表
- `fetchAlbumDetails()`: 獲取專輯詳情
- `fetchSongs()`: 獲取歌曲列表
- `fetchSongDetails()`: 獲取歌曲詳情
- `fetchLyrics()`: 獲取歌詞

**幹員相關 API：**
- `fetchCharacters()`: 獲取所有幹員列表
- `fetchCharacterDetails(charId)`: 獲取幹員詳細資料
- `getCharacterAvatarUrls(charId)`: 獲取幹員頭像 URL 列表（多來源）
- `getCharacterAvatarFallbackUrl(charId, index)`: 獲取備用頭像 URL

### 幹員圖鑑系統

#### 功能概述
完整的明日方舟幹員資料查詢系統，包含所有遊戲內幹員的詳細資訊。

#### 主要特色
1. **完整的資料展示**
   - 幹員立繪：支援精一、精二立繪切換查看
   - 特性說明：自動解析遊戲內特殊標籤和變數
   - 屬性數值：顯示各精英階段的完整屬性
   - 攻擊範圍：視覺化顯示各階段的攻擊範圍網格
   - 天賦詳情：包含解鎖條件和完整描述
   - 潛能提升：格式化顯示潛能效果
   - 技能詳情：包含 SP 消耗、持續時間、技能類型等
   - 後勤技能：顯示基建技能資訊
   - 材料需求：精英化和技能升級所需材料（含圖片）
   - 模組資訊：顯示模組名稱、描述和解鎖條件
   - 幹員檔案：可展開查看的檔案內容

2. **強大的篩選功能**
   - 稀有度多選：可同時選擇多個稀有度（1-6星）
   - 職業篩選：按職業類型篩選
   - 名稱搜索：即時搜索幹員名稱

3. **圖片載入優化**
   - 多來源備援：自動嘗試多個圖片 CDN 來源
   - 智能降級：當一個來源失敗時自動切換下一個
   - 錯誤處理：完善的錯誤處理和佔位符顯示

4. **資料來源**
   - 使用開源的明日方舟遊戲資料庫
   - 從 GitHub 多個倉庫獲取資料和圖片
   - 自動解析和格式化遊戲資料

### 音樂播放器改進

#### 歌詞同步優化
- 使用 `requestAnimationFrame` 實現高頻率同步
- 支援手動滾動時仍保持歌詞高亮同步
- 自動恢復滾動功能（手動滾動後 3 秒恢復）

#### 交互改進
- **點擊正在播放的音樂標題**：直接打開播放器視圖，查看詳細信息和歌詞
- **下拉式選單**：
  - 點擊按鈕顯示所有歌曲列表
  - 按鈕圖標會根據選單狀態切換（向上/向下箭頭）
  - 在小屏幕上自動調整寬度，確保完整顯示
- **搜索欄優化**：在小屏幕上自動占滿可用寬度，不再居中顯示

### 文字亂碼動畫效果
- 頁面首次加載時，所有文字會從亂碼逐漸解碼為正常文字
- 動畫持續 3 秒，提供獨特的視覺體驗
- 支持中文、日文、英文和符號的智能解碼
- 動畫僅在首次加載時執行一次

### 響應式設計增強
- 搜索欄在手機端自動適配寬度
- 下拉選單在小屏幕上自動調整大小
- 專輯列表支持分頁瀏覽
- 所有組件都針對移動設備進行了優化
- 觸控設備自動隱藏滑鼠特效

### 圖片路徑修復
- 所有圖片路徑都支持 GitHub Pages 的 base 路徑
- 自動適配不同的部署環境

## 部署

本專案已配置 GitHub Pages 自動部署。每次推送到 main 分支時，GitHub Actions 會自動建構並部署網站。

网站地址：https://asriel0727.github.io/ArknightMusicWeb/

### 部署配置

- **構建工具**：Vite
- **部署方式**：GitHub Actions
- **Base 路徑**：`/ArknightMusicWeb/`（在 `vite.config.js` 中配置）

詳細部署說明請參考 `DEPLOY.md` 文件。

