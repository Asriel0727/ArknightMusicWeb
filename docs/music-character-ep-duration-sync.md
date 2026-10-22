# MV 時長自動校正

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
