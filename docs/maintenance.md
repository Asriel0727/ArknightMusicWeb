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

活動卡池同步（既有資料庫請先於 Supabase 執行
`docs/activity-recruitment-pool-sync-migration.sql`；全新資料庫才執行
`docs/activity-recruitment-schema.sql`，並在本機設定 `SUPABASE_SERVICE_ROLE_KEY`）：

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<Supabase service role key>"
npm run activities:sync
npm run activities:audit-pools
```

`activities:sync` 先從 Wiki、官方公告、三服卡池遊戲資料與幹員實裝紀錄產生交叉比對的活動卡池，接著以
`activity code + server + pool slug` 寫入 Supabase。它不會刪除既有資料；可先使用
`npm run activities:push-pools -- --dry-run` 檢視預計寫入的筆數。

僅更新本地資料、不寫入資料庫時，使用 `npm run activities:sync-pools`。
結果儲存在 `src/data/verifiedActivityPools.js`，前端會直接載入；完整比對報告在
`docs/data/activity-pool-audit.json`。報告包含尚無唯一來源配對的紀錄、實裝日期衝突、
活動與卡池日期差異，以及實際畫面仍缺卡池或缺確切時間的清單。

卡池比對必須有活動所屬事件與 UP 幹員的證據，不能只靠同期日期；繁中服不借用國際服日期。
幹員首次實裝日期與本期尋訪時間分開保存，復刻不會改寫首次實裝日期。
官方公告優先於遊戲資料中的預載開放時間。未實裝幹員可以先顯示公告名單與預定實裝日期，
ID 尚未公布時不提供幹員詳情入口。只有日期的卡池保留日期精度；無時間來源則明確標示，
不再將活動起訖時間填入卡池。資料庫的 `start_at` 不可為空，因此寫入腳本只推送有確切時間的卡池，
日期精度與來源仍由本地資料補充顯示。

產生器會將唯讀來源暫存於忽略版控的 `tmp/activity-pools/`。
`node scripts/sync-verified-activity-pools.mjs` 可重用快照；`--refresh` 重新抓取來源。

## 自動卡池同步

卡池同步由 Cloudflare Worker 的既有六小時 cron 執行：每個伺服器完成活動資料同步後，會立即
優先寫入已交叉核對且有確切時間的卡池，再以事件、幹員實裝紀錄與遊戲卡池時間比對新的 Wiki 招募 banner。
無法唯一確認的項目不猜測寫入，會回報於同步結果的 `unresolved`；來源暫時失敗時仍保留既有核對資料。
它使用 Worker 已有的 `SUPABASE_SERVICE_ROLE_KEY` secret，
不需要 GitHub Actions 或額外 GitHub Secret。本機的 `npm run activities:sync` 僅保留給需要立即
回補資料與更新完整來源快照時使用。需要部署更新後的 Worker，排程才會使用新的比對規則。

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
