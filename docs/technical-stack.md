# 技術線與架構文件

這份文件整理專案使用的技術、資料流與部署方式。

## 技術組成

### Frontend

- Vue 3
- Vite
- Vue I18n
- Font Awesome icon
- 原生 HTML audio

### Backend

- Cloudflare Worker
- Cloudflare KV `ARKNIGHTS_DATA`
- Cloudflare Cache API
- Supabase REST API

### External Sources

- Monster Siren 音樂 API
- Arknights game data
- 多個角色圖片 GitHub raw mirror
- Google Translate public endpoint for lyric translation

## 架構圖

![技術架構](assets/technical-architecture.svg)

## 前端模組

- `App.vue`：頁面切換與全域 audio element 初始化。
- `PlayerView.vue`：播放器主畫面。
- `AlbumList.vue` / `AlbumDetails.vue`：專輯列表與詳情。
- `UserLibraryView.vue`：我的最愛、歌單、角色清單。
- `CharacterList.vue` / `CharacterDetails.vue`：角色圖鑑與詳情。
- `RecruitCardMaker.vue`：招募卡製作。
- `Modal.vue`：專輯、播放器、角色詳情共用 Modal。

## Worker API

### Public

```txt
GET /api/health
GET /api/albums
GET /api/album/:albumId/detail
GET /api/songs
GET /api/song/:songId
GET /api/search
GET /api/full-song/:songId
GET /api/recruit/operators
GET /api/recruit/operators/:charId
GET /api/recruit/image?url=...&alt=...
GET /share/song/:songId
GET /proxy-image?url=...
GET /proxy-lyrics?url=...
GET /proxy-audio?url=...
POST /api/lyrics/translate
```

### Auth/User

```txt
POST /api/auth/sign-up
POST /api/auth/sign-in
GET /api/auth/user
GET/POST/DELETE /api/user/favorite-songs
GET/POST/PATCH/DELETE /api/user/playlists
POST/DELETE /api/user/playlists/:playlistId/songs
GET/POST/PATCH/DELETE /api/user/character-lists
POST/DELETE /api/user/character-lists/:listId/items
```

### Admin

```txt
GET /api/admin/sync
GET /api/admin/sync-music
GET /api/admin/music-cache-status
GET /api/admin/prewarm-music-albums
GET /api/admin/prewarm-details
```

Admin endpoint 需要 `SYNC_TOKEN`。

## 圖片策略

角色圖片不再讓前端直接依賴單一 GitHub raw URL。Worker 會：

1. 接收主要 URL 與 fallback URL。
2. 依序請求每個來源。
3. 第一個成功來源會回傳給前端。
4. 成功結果進入 Cloudflare cache。

這可以降低單一 GitHub raw mirror 429 對使用者的影響。

## 使用者資料

使用者登入 session 由 Worker 管理。使用者內容資料存放在 Supabase：

- `user_favorite_songs`
- `user_playlists`
- `user_playlist_songs`
- `user_character_lists`
- `user_character_list_items`

Schema 位於：

```txt
docs/user-library-schema.sql
```

## 部署

前端可透過 GitHub Actions 部署到 GitHub Pages。Worker 透過 Wrangler 部署。

部署相關文件：

- `docs/deployment/github-pages.md`
- `docs/cloudflare-recruit-api.md`
- `wrangler.toml`

## 技術風險

- 外部音樂 API 或遊戲資料來源可能變動。
- GitHub raw mirror 仍可能被限流，但 Worker fallback/cache 可降低影響。
- Supabase service role key 必須只放在 Worker secret。
- 若 KV cache schema 改變，要同步更新 cache key version 或提供清 cache 工具。
