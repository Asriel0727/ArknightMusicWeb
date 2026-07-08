# 開發與維護手冊

這份文件給後續維護者使用，重點是快速理解資料流、常見問題與修改位置。

## 常用指令

```bash
npm install
npm run dev
npm run build
npm run preview
```

Worker 語法檢查：

```bash
node --check worker/index.js
```

## 主要資料夾

- `src/components/`：Vue UI 元件。
- `src/services/`：API、登入、快取與使用者資料服務。
- `src/stores/`：播放器、Modal、角色詳情等共用狀態。
- `src/i18n/`：多國語系文字。
- `src/utils/`：歌詞、格式化、招募卡、文字動畫工具。
- `worker/`：Cloudflare Worker 後端。
- `docs/`：專案文件、schema、部署筆記。
- `scripts/`：本機開發輔助腳本。

## 前端狀態

主要狀態集中在 `src/stores/player.js`：

- `playerState`：目前播放歌曲、queue、播放模式、歌詞、翻譯狀態。
- `albumState`：專輯詳情與歌曲。
- `modalState`：目前 Modal 顯示 album/player/character。
- `characterState`：目前角色詳情。

## API 入口

主要 API 包裝在 `src/services/api.js`：

- 音樂資料：專輯、歌曲、完整歌曲詳情、歌詞。
- 角色資料：角色列表、角色詳情、圖片 proxy。
- 搜尋與分享。

使用者資料在 `src/services/userLibrary.js`：

- 我的最愛
- 歌單
- 角色清單

## Worker 維護

Worker 入口是 `worker/index.js`，設定在 `wrangler.toml`。

重要能力：

- 音樂 API proxy/cache。
- 歌詞翻譯與快取。
- 分享頁 Open Graph metadata。
- 使用者登入、session、收藏、歌單、角色清單 API。
- 角色資料 API。
- 角色圖片 proxy，多來源 fallback，成功後使用 Cloudflare cache。

## Cache Key 注意事項

角色 cache key 目前使用：

```txt
recruit:operators:v3
recruit:operator:v3:{charId}
```

只有在「快取資料結構改變，且舊快取會造成錯誤」時才需要升版本。一般 UI 或 CSS 修改不需要改。

## 常見問題

### GitHub raw 429

原因：GitHub raw 不是正式 CDN，短時間大量請求會被限制。

處理策略：

- 前端不要直接抓 GitHub raw。
- 角色圖片走 Worker `/api/recruit/image`。
- Worker 會嘗試多個圖片來源，成功後快取。

### CORS 錯誤

先確認 Worker 回應是否包含：

```txt
Access-Control-Allow-Origin: *
```

使用者 API 若回 401 是正常登入狀態問題；若瀏覽器顯示 CORS，通常是錯誤回應沒有正確帶 CORS header。

### 角色資料很慢

角色詳情資料較重，包含多張立繪、技能、材料、模組等。若體感慢，優先做：

- Modal 先開 loading，再背景載入詳情。
- Worker 預熱角色詳情。
- 減少前端一次載入的圖片數量。

### 歌單播放範圍錯誤

檢查 `playerState.currentPlaylist` 是否被設成正確來源：

- 專輯播放應是專輯歌曲。
- 歌單播放應是歌單歌曲。
- 單首分享播放可只有單首。

## 提交前檢查

```bash
npm run build
node --check worker/index.js
git status --short
```

不要提交：

- `.env.local`
- `node_modules/`
- `dist/`
- `.wrangler/`
- `.vs/`
