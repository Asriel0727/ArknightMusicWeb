# 資料夾結構與清理指南

本文件的目標是讓原始碼、可重建產物、暫存資料與大量靜態資產各自有明確位置，避免 Git 歷史被無法維護的檔案淹沒。

## 分類總覽

| 類別 | 位置 | Git 策略 | 說明 |
| --- | --- | --- | --- |
| 必須維護的原始碼 | `src/`、`worker/`、`scripts/` | 提交 | 修改功能的主要位置 |
| 必須維護的設定 | `package.json`、`vite.config.js`、`wrangler.toml`、`.github/` | 提交 | 可重現建置、部署與排程 |
| 正式靜態資產 | `public/images/`、`public/logo.png`、`public/styles.css` | 依專案策略提交 | 網站直接使用的圖片與 manifest |
| 文件與 schema | `docs/` | 提交 | 維護知識、部署流程與資料庫結構 |
| 建置產物 | `dist/`、`dist-portable/` | 不提交 | 可由 `npm run build*` 重新產生 |
| 套件與工具快取 | `node_modules/`、`.wrangler/` | 不提交 | 可由安裝或工具重新產生 |
| 暫存資料 | `tmp/` | 不提交 | 稽核輸出、人工交接、一次性分析資料 |

## 建議保留並提交

```text
src/
worker/
scripts/
public/images/manifest/
public/images/{operators,skills,modules,items,factions,classes,activities,recruit}/
docs/
.github/workflows/
package.json
package-lock.json
vite.config.js
wrangler.toml
```

`public/images/` 雖然體積大，現階段仍是正式執行時資產，不能因為「很大」就直接刪除。應先確認 manifest、前端引用與 Worker fallback 是否都已改為遠端或物件儲存，再進行遷移。

## 可安全忽略／不應上傳

以下項目已在 `.gitignore` 中或應補入忽略規則；它們不應進版控：

| 路徑 / 類型 | 原因 | 取得方式 |
| --- | --- | --- |
| `node_modules/` | 套件安裝結果，平台相關且龐大 | `npm install` / `npm ci` |
| `dist/` | GitHub Actions 會重新建置 | `npm run build` |
| `dist-portable/` | 發布附件產物 | `npm run build:portable` |
| `.wrangler/` | Worker 本機執行狀態 | Wrangler 自動建立 |
| `tmp/` | 稽核 JSON、暫時交接筆記、一次性結果 | 對應 script 重新執行或人工建立 |
| `.env*` | 可能含 API URL、token 或 key | 本機 / CI / Cloudflare Secrets 設定 |
| `coverage/`、`playwright-report/`、`test-results/` | 測試報告產物 | 測試工具重新產生 |
| `*.log` | 記錄檔 | 工具重新產生 |

## 本次觀察與處理建議

| 項目 | 觀察 | 建議 |
| --- | --- | --- |
| `public/` 與 `dist/` | 兩者都約 4 GB；`dist/` 是由 `public/` 等來源建置出來 | 保留 `public/`，保持 `dist/` 忽略且必要時清理本機 |
| `.git/` | 約 4 GB，代表歷史可能已含大型二進位資產 | 不要直接改寫歷史；未來大型資產建議評估 Git LFS 或 R2/CDN |
| `tmp/` | 約 15 MB，包含 audit 與 handoff | 保持忽略；若交接內容需要長期保存，移到 `docs/` 並去除敏感資訊 |
| `.github/workflows/sync-character-eps.yml` | 目前有未提交修改 | 屬正在開發內容，本次文件整理不碰它 |

## 建議補強 `.gitignore`

目前忽略規則已覆蓋主要建置產物。建議加入以下通用產物，避免未來測試或環境檔意外上傳：

```gitignore
# Local configuration and test artifacts
.env
.env.*
!.env.example
playwright-report/
test-results/
```

> 加入 `.env.*` 前，若未來需要提交像 `.env.production` 的非機密範本，請明確使用 `!.env.production.example` 之類的例外規則。

## 刪除前檢查清單

刪除任何大型資料夾前，先逐項確認：

1. 它是否在 `.gitignore`，且不是正式來源檔？
2. 是否可由指令、CI 或外部資產同步重建？
3. 是否沒有被 `src/`、manifest 或部署流程直接引用？
4. 是否已備份任何無法重建的本機交接內容？

符合以上條件時，優先清理本機的 `dist/`、`dist-portable/`、`node_modules/`、`.wrangler/` 與 `tmp/`；本文件僅提供判斷，未自行刪除檔案。
