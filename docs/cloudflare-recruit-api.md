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
- Setup token used during local testing: `ark-sync-2026`

Do not commit real production secrets if the token is changed later.
Never commit the Supabase service role key. Store it only as a Cloudflare Worker secret.

## Scheduled Sync

The Worker has a cron trigger:

```txt
0 */6 * * *
```

This syncs the recruit operator list every 6 hours.

## KV Keys In Use

Current keys:

```txt
recruit:operators:v2
recruit:operator:v2:{charId}
```

Old keys without `v2` can be deleted:

```txt
recruit:operators
recruit:operator:{charId}
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
GET /api/recruit/operators
GET /api/recruit/operators/:charId
GET /api/recruit/image?url=...
```

Admin:

```txt
GET /api/admin/sync
GET /api/admin/sync-music
GET /api/admin/prewarm-details?offset=0&limit=40
```

Admin endpoints require:

```txt
Authorization: <SYNC_TOKEN>
```

`Bearer <SYNC_TOKEN>` also works.

## Current Cache Strategy

- Operator list is stored in KV under `recruit:operators:v2`.
- Operator detail JSON is stored in KV under `recruit:operator:v2:{charId}`.
- Music API JSON can be mirrored into Supabase table `music_cache`.
- Music cache keys use the prefix `music:api:v1:`.
- Music song details are prewarmed in batches into `music:api:v1:song:{songId}`.
- Song detail prewarm progress is stored in `music:api:v1:prewarm:song-detail-cursor`.
- All 418 operator detail entries were prewarmed into remote KV during setup.
- Image URLs returned by the API go through `/api/recruit/image`.
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

Manual music sync with a larger song detail prewarm batch:

```powershell
Invoke-RestMethod `
  -Uri "https://arknights-recruit-api.molly27molly.workers.dev/api/admin/sync-music?songDetailLimit=10" `
  -Headers @{ Authorization = "ark-sync-2026" }
```

Use `songDetailLimit=0` to refresh only the album/song lists without prewarming song details.
The Worker caps this value at 10 to avoid request timeouts. The cron sync prewarms 10 song details automatically every run.

The frontend can opt into the Worker-backed music mirror with:

```env
VITE_MUSIC_API_ORIGIN=https://arknights-recruit-api.molly27molly.workers.dev
```

If this env var is not set, the frontend keeps using the original Monster Siren API.

## Useful Commands

Deploy Worker:

```powershell
npx wrangler deploy
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
  --prefix="recruit:operator:v2:" | ConvertFrom-Json

$keys.Count
```

Delete old non-v2 detail keys:

```powershell
$keys = npx wrangler kv key list `
  --binding=ARKNIGHTS_DATA `
  --remote `
  --prefix="recruit:operator:" | ConvertFrom-Json

$oldKeys = $keys | Where-Object {
  $_.name -like "recruit:operator:*" -and
  $_.name -notlike "recruit:operator:v2:*"
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
