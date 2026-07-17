# Cloudflare Recruit API Progress

This file records the current backend state so the project can be resumed from another computer.

## Worker

- Worker name: `arknights-recruit-api`
- Worker URL: `https://arknights-recruit-api.molly27molly.workers.dev`
- Wrangler config: `wrangler.toml`
- Worker entry: `worker/index.js`
- Compatibility date: `2026-06-10`

## Cloudflare Bindings

- KV binding: `ARKNIGHTS_DATA`
- KV namespace id: `1f16c51e50154624856b1feb4f67ea2e`
- Secret required: `SYNC_TOKEN`
- Secret required for Supabase music mirror: `SUPABASE_SERVICE_ROLE_KEY`
- Variable: `SUPABASE_URL=https://rdneemerltoxlfosazcz.supabase.co`

Do not commit real production secrets if the token is changed later.
Never commit the Supabase service role key. Store it only as a Cloudflare Worker secret.

## Scheduled Sync

The Worker has a cron trigger:

```txt
0 */6 * * *
```

This syncs the recruit operator list every 6 hours. When Supabase is configured,
the same cron also refreshes the music album/song lists and prewarms a small batch
of song details and album details.

## KV Keys In Use

Current keys:

```txt
recruit:operators:v3
recruit:operator:v3:{charId}
```

Old keys without `v3` can be deleted after the new cache is warmed:

```txt
recruit:operators
recruit:operators:v2
recruit:operator:{charId}
recruit:operator:v2:{charId}
```

## API Endpoints

Public:

```txt
GET /api/health
GET /api/albums
GET /api/album/:albumId/detail
GET /api/songs
GET /api/song/:songId
GET /proxy-image?url=...
GET /proxy-lyrics?url=...
GET /proxy-audio?url=...
GET /api/recruit/operators
GET /api/recruit/operators/:charId
GET /api/recruit/image?url=...
GET /api/activities?server=tw|global|cn
```

## Activity and recruitment archive

Run [`activity-recruitment-schema.sql`](../docs/activity-recruitment-schema.sql) in the Supabase SQL editor before deploying the activity endpoint. The endpoint returns each activity window for the requested server, together with its linked recruitment pools and non-pool operator acquisition records.

The schema intentionally keeps `activities` server-neutral and puts date ranges in `activity_windows`; the same activity can therefore have different windows on CN, Global, and Traditional Chinese servers without duplicating its translated names.

Activity windows are synchronized automatically during the existing cron run. To backfill immediately after deployment:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/sync-activities" `
  -Headers @{ Authorization = "<SYNC_TOKEN>" }
```

PRTS is the authoritative CN source for Chinese activity names, categories, and CN time windows. Arknights Wiki supplies the matching English, Traditional Chinese, Japanese, and Korean names plus Global / TW windows. Activities that only exist in PRTS are kept as CN-only records. Recruitment pools and free-operator records remain separate curated data because neither source exposes those relationships as normalized records.

Admin:

```txt
GET /api/admin/sync
GET /api/admin/sync-music
GET /api/admin/music-cache-status
GET /api/admin/prewarm-music-albums?limit=5
GET /api/admin/prewarm-details?offset=0&limit=40
```

Admin endpoints require:

```txt
Authorization: <SYNC_TOKEN>
```

`Bearer <SYNC_TOKEN>` also works.

## Current Cache Strategy

- Operator list is stored in KV under `recruit:operators:v3`.
- Operator detail JSON is stored in KV under `recruit:operator:v3:{charId}`.
- Music API JSON can be mirrored into Supabase table `music_cache`.
- Music cache keys use the prefix `music:api:v1:`.
- Music song details are prewarmed in batches into `music:api:v1:song:{songId}`.
- Music album details are prewarmed in batches into `music:api:v1:album:{albumId}`.
- Song detail prewarm progress is stored in `music:api:v1:prewarm:song-detail-cursor`.
- Album detail prewarm progress is stored in `music:api:v1:prewarm:album-detail-cursor`.
- All 418 operator detail entries were prewarmed into remote KV during setup.
- Image URLs returned by the API go through `/api/recruit/image`.
- Recruit images support fallback mirrors with repeated `alt` query params:

```txt
GET /api/recruit/image?url=<primary>&alt=<fallback1>&alt=<fallback2>
```

- The Worker tries each image URL in order and caches the first successful response.
- The image proxy only allows `https://raw.githubusercontent.com/...` image URLs.
- Image responses use Cloudflare cache with:

```txt
public, max-age=2592000, immutable
```

Images are cached by Cloudflare after first fetch. They are not permanently stored in KV.

## Supabase Music Mirror

Create this table in Supabase SQL editor:

```sql
create table if not exists public.music_cache (
  key text primary key,
  data jsonb not null,
  source text,
  updated_at timestamptz not null default now()
);
```

Optional normalized music tables:

```sql
create table if not exists public.music_albums (
  id text primary key,
  name text not null,
  artists jsonb not null default '[]'::jsonb,
  intro text,
  belong text,
  cover_url text,
  cover_de_url text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.music_songs (
  id text primary key,
  album_id text references public.music_albums(id) on delete set null,
  name text not null,
  artists jsonb not null default '[]'::jsonb,
  source_url text,
  lyric_url text,
  mv_url text,
  mv_cover_url text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists music_songs_album_id_idx
  on public.music_songs(album_id);
```

`music_cache` keeps the original API payload for fallback. `music_albums` and `music_songs`
store queryable, normalized data for your own database.

Set the Worker secret:

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Manual music sync:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/sync-music" `
  -Headers @{ Authorization = "ark-sync-2026" }
```

Manual music sync with detail prewarm batches:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/sync-music?songDetailLimit=10&albumDetailLimit=5" `
  -Headers @{ Authorization = "ark-sync-2026" }
```

Use `songDetailLimit=0&albumDetailLimit=0` to refresh only the album/song lists without prewarming details.
The Worker caps song details at 10 and album details at 5 to avoid request timeouts. The cron sync
prewarms 10 song details and 5 album details automatically every run.

Prewarm normalized album details in batches. This fills `music_albums` detail fields and
`music_songs.album_id` from album track lists:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/prewarm-music-albums?limit=5" `
  -Headers @{ Authorization = "ark-sync-2026" }
```

Run this repeatedly until `done` is `true`. `wrapped=true` means the cursor reached the end of the
current list and wrapped back to the beginning.

Check music database completeness:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/music-cache-status" `
  -Headers @{ Authorization = "ark-sync-2026" }
```

The status endpoint returns album/song counts, missing `source_url` / `album_id` counts,
latest updated rows, and the current prewarm cursors.

If `albums.withIntro` is `0` after a previous sync, deploy the latest Worker and rerun the
album detail prewarm. Older sync code could overwrite album detail fields with empty values
from the basic album list response.

The frontend can opt into the Worker-backed music mirror with:

```env
VITE_MUSIC_API_ORIGIN=https://arknights-recruit-api.molly27molly.workers.dev
```

If this env var is not set, the frontend keeps using the original Monster Siren API.

## Useful Commands

Deploy Worker:

```powershell
npx.cmd wrangler deploy
```

Build frontend:

```powershell
npm.cmd run build
```

Check Worker syntax without deploying:

```powershell
node --check worker\index.js
```

Manual list sync:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/sync" `
  -Headers @{ Authorization = "ark-sync-2026" }
```

Prewarm details in batches:

```powershell
$base = "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/prewarm-details"
$headers = @{ Authorization = "ark-sync-2026" }
$offset = 0
$limit = 40

do {
  $uri = "$base`?offset=$offset&limit=$limit"
  $r = Invoke-RestMethod -Uri $uri -Headers $headers
  Write-Output ("offset={0} stored={1} next={2} done={3} errors={4}" -f $r.offset, $r.stored, $r.nextOffset, $r.done, $r.errorCount)
  $offset = [int]$r.nextOffset
  Start-Sleep -Milliseconds 700
} while (-not $r.done)
```

Count prewarmed remote detail keys:

```powershell
$keys = npx wrangler kv key list `
  --binding=ARKNIGHTS_DATA `
  --remote `
  --prefix="recruit:operator:v3:" | ConvertFrom-Json

$keys.Count
```

Delete old non-v3 detail keys:

```powershell
$keys = npx wrangler kv key list `
  --binding=ARKNIGHTS_DATA `
  --remote `
  --prefix="recruit:operator:" | ConvertFrom-Json

$oldKeys = $keys | Where-Object {
  $_.name -like "recruit:operator:*" -and
  $_.name -notlike "recruit:operator:v3:*"
}

$oldKeys | ForEach-Object {
  Write-Host "Deleting $($_.name)"
  npx wrangler kv key delete `
    --binding=ARKNIGHTS_DATA `
    --remote `
    $_.name
}
```

## Frontend

The frontend already points recruit data to:

```txt
https://arknights-recruit-api.molly27molly.workers.dev
```

The default is defined in `src/services/api.js` as `DEFAULT_RECRUIT_API_BASE`.

For another deployment target, use:

```env
VITE_RECRUIT_API_BASE=https://arknights-recruit-api.molly27molly.workers.dev
```
