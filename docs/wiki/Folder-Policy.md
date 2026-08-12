# 資料夾策略

| 要保留在 Git 的內容 | 不要提交的內容 |
| --- | --- |
| 原始碼、腳本、Worker、schema、文件、workflow、必要的正式靜態資產 | 建置產物、`node_modules`、Wrangler 狀態、暫存資料、環境檔、token、測試報告 |

```text
提交：src/ worker/ scripts/ docs/ public/images/ .github/
忽略：node_modules/ dist/ dist-portable/ .wrangler/ tmp/ .env*
```

大型 `public/images/` 目前是執行時需要的資產；若要縮小 repository，請先將資產遷移至版本化 CDN / R2，更新 manifest 與 fallback，再移除本機副本。不要直接刪除。

詳細的檢查方式與建議見 [資料夾結構與清理指南](../folder-structure.md)。
