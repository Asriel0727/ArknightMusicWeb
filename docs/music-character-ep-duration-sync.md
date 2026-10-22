# MV 音軌與時長自動校正

## 音軌比對優先

每日角色 EP 同步會先使用 Bilibili `x/player/pagelist` 自動取得第一分 P 的 CID 與時長，
再以 `x/player/playurl` 的 `dash.audio` 取得 AAC 主音軌與備援網址。
不依賴 `x/web-interface/view` 或影片網頁內的 `__INITIAL_STATE__`。
若接口失敗，才嘗試 yt-dlp；若主 CDN 無法下載，會試備援 CDN。
同時取得歌曲最新的官方音訊。分析在 GitHub Actions 執行，不在手機或 Worker 執行。
CID 保存在 `raw.bilibili.cid`；短效音軌網址只在本次分析暫存，沒有寫進資料庫。

兩個音軌使用 ffmpeg 解碼成 8 kHz 單聲道，取 12 頻帶的頻譜變化，
以 normalized cross-correlation 分別搜尋前、中、後三個 15 秒片段。
搜尋範圍為正負 60 秒，時間格點為 20 ms；最多分析前 10 分鐘。

三段相似度均至少 0.65、與其他候選峰差距至少 0.08，且三段偏移差距不超過 0.16 秒，
才接受單一固定 offset。相似度是篩選分數，不是成功機率。
相似度不足、重複片段造成歧義、靜音、速度漂移或剪輯差異均自動退回既有方式。

成功結果存於既有 `music_character_ep_videos.raw.audioSync`，
包含歌曲／影片 ID、正負 offset、相似度、三段結果、演算法版本、來源雜湊與分析時間。
不需新增欄位，也不將負值寫入舊的非負 `video_offset_seconds` 欄位。
每次 upsert 保留 raw 內的既有欄位。

同來源成功結果沿用 30 天；來源音檔路徑、影片 ID、影片時長或演算法版本改變時重算。
官方 URL 的簽章輪替不會觸發重算。同 URL 的內容遭替換，則等待定期重算才能發現。
同來源重算失敗保留原成功結果；換來源時不套用舊結果。
失敗間隔至少 6 小時重試，並紀錄於 `raw.audioSyncAttempt`。

每次最多 8 次分析／失敗嘗試，開始新分析的時間預算為 8 分鐘；
已開始的分析最多再執行 210 秒。優先處理最久未嘗試的項目，讓既有歌曲逐批補齊，
避免某首無法下載的 MV 卡住整批。`audioSync` 統計會列出 accepted、cached、cooldown、failed、deferred。
下載檔案僅暫存於 runner，分析結束即清除，不上傳音檔。
可用 `CHARACTER_EP_AUDIO_SYNC=0` 暫停音軌分析而保留映射與時長同步。

Worker 僅傳回驗證過且符合歌曲／影片 ID 的公開校正欄位，前端採用順序為：

1. 可信音軌比對結果（含 0 與負值）。
2. MV 與音訊總時長差。
3. 資料庫既有 offset／平台預設值。

新功能需要推送排程程式、部署 Worker 及前端後生效。dry-run 會分析但不寫資料庫，
apply／每日排程才會保存結果。Bilibili 阻擋讀取時會自動退回舊方式，下次排程再試，
不要求逐首人工審核。音軌校正無法消除嵌入播放器的載入／緩衝延遲。

2026-10-22 已使用《大地之鹽》從影片 ID 全自動取得 CID、取得新音軌網址、下載並比對，
不使用手動貼上的播放資料。三段 offset 都為 +0.02 秒，相似度最低 0.9803，
取得方式為 `playurl`。該環境的 `view` 接口仍為 412，但 pagelist／playurl 可用。
這是單次環境驗證，不代表所有影片或所有 runner 都能避開來源服務的限制。

## 時長差作為備援

角色 EP 同步腳本會擷取 Bilibili 第一分 P 的 `duration`，寫入既有的
`music_character_ep_videos.duration_seconds`。不需要資料庫 migration。
取得失敗時保留既有時長，並在同步輸出 `videoDurationFailures`；不影響 MV 關聯。

前端取得音訊 metadata 後，使用實際 `playerState.duration` 計算：

```text
offset = MV 時長 - 音訊時長
MV 播放位置 = max(0, 音訊目前時間 + offset)
```

例如 MV 201 秒、音訊 200 秒，自動採用 1 秒，取代先前固定的 5 秒。
音訊 metadata 較晚到達時，播放器會重新對齊 MV。
例如 MV 197 秒、音訊 200 秒，offset 為 -3 秒；音訊先播放，
到第 3 秒才啟動 MV。從音訊第 20 秒切換到 MV 時，MV 從第 17 秒開始。
等待依音訊目前時間判定，暫停不會消耗等待時間；拖曳回第 3 秒以前會重新等待。
任一時長缺漏時，沿用資料庫 offset／原本平台預設值。

這是依總時長推估片頭的方式，假設 MV 多出的時間在片頭。
片尾加長或不同剪輯版本仍可能不同步。負值假設音訊前面多出相應時間，
採用延後 MV 開始的方式，不改動播放速度。
正負差值在前端以時長即時計算，不寫入舊的非負 `video_offset_seconds` 欄位。

部署前端後，既有排程下一次以 apply 執行便會補齊 MV 時長。
也可以手動執行既有 Sync Character EP 工作流程並選擇 apply。
只有 dry-run 不會更新資料庫。
