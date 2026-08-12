# 部署與營運

## 自動化

| 工作流 | 觸發方式 | 產物 / 行為 | 所需設定 |
| --- | --- | --- | --- |
| `deploy.yml` | 推送 `main` 或手動執行 | 建置並部署 GitHub Pages；上傳 portable artifact | `VITE_MUSIC_API_ORIGIN` 已在 workflow 設定 |
| `sync-character-eps.yml` | 每日排程或手動執行 | 以 Playwright 收集角色 EP metadata 並寫入 Supabase | `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；`BILIBILI_SESSDATA` 選用 |
| Worker cron | 每 6 小時 | 同步 / 預熱角色、活動與音樂相關資料 | Worker KV、Supabase secret、cron 設定 |

## 部署順序

1. 在 Supabase 執行需要的 schema migration。
2. 在 Cloudflare 設定 KV binding、variables 與 secrets。
3. 部署 Worker：`npm run worker:deploy`。
4. 推送 `main`，由 GitHub Actions 建置與部署前端。
5. 以 `/api/health` 及前端關鍵功能確認部署設定。

## 重要安全原則

- Admin API 必須以 `SYNC_TOKEN` 授權；不要把 token 放到文件、網址截圖或 commit。
- `SUPABASE_SERVICE_ROLE_KEY` 擁有管理權限，只能放 Worker secret 或 GitHub Actions secret。
- GitHub Actions 使用的 Bilibili `SESSDATA` 是私人瀏覽器 session，應視為密碼。
- Bilibili 可能回傳 412 反自動化頁面；角色 EP 同步失敗不應中斷一般音樂同步或清除既有可用影片資料。

詳細 SQL、API 與手動同步說明見 repository 的 `docs/cloudflare-recruit-api.md`。
