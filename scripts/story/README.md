# 劇情快照流程

`StoryStage.vue` 只讀取 `public/story/catalog.json`、每篇的 `manifest.json` 與 `script.txt`，不直接依賴 PRTS 連線。新增劇情時在 `stories.json` 加一筆 `id`、`page`、`title`，必要時加 `fallbackScriptUrl`；接著執行 `npm run story:sync -- --story <id>`。成功後，故事會自動出現在同一個播放器的選單。

同步器會從劇情指令收集背景、CG、立繪、配樂、音效、影片引用。圖片依 PRTS Wiki 檔名規則嘗試下載，並保留原始 PNG、另產生較小的 WebP 供網頁顯示；音訊依遊戲 `story_variables.json` 對照到 PRTS 音訊站。特殊 PNG 可用 `imageSources`、特殊音訊可用 `audioSources` 覆寫 URL。影片目前沒有通用的 PRTS 路徑規則，需在該筆設定提供 `videoSources`（影片 ID 對 HTTPS URL 的物件）。無法解析或下載的素材會使同步失敗，不會產生缺檔的新 manifest。

`npm run story:sync -- --offline` 用已下載的素材與對照表驗證並重建 manifest；`--overwrite` 會嘗試重新下載來源，來源暫時故障時沿用已驗證的本地檔案，兩個旗標不可同時使用。每月 GitHub Actions 會同步 `stories.json` 中全部故事、跑劇情測試及建置，成功後才提交快照；既有的 main 部署工作流程會處理 Pages 發布。單一影片超過約 95 MiB 時同步會失敗，以避免碰到 GitHub 單檔限制。

這個框架自動化的是「從已登錄的劇情頁解析所引用資源並同步」，不是抓取 PRTS 全站所有故事。PRTS raw 頁面若拒絕自動存取，必須設定可讀的原文備援來源。播放器目前支援常見背景、CG、立繪、選項、基本遮罩、灰階、音效、配樂與影片；新指令仍需逐類實作演出語意。
