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
- Setup token used during local testing: `ark-sync-2026`

Do not commit real production secrets if the token is changed later.

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
GET /api/recruit/operators
GET /api/recruit/operators/:charId
GET /api/recruit/image?url=...
```

Admin:

```txt
GET /api/admin/sync
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
- All 418 operator detail entries were prewarmed into remote KV during setup.
- Image URLs returned by the API go through `/api/recruit/image`.
- The image proxy only allows `https://raw.githubusercontent.com/...` image URLs.
- Image responses use Cloudflare cache with:

```txt
public, max-age=2592000, immutable
```

Images are cached by Cloudflare after first fetch. They are not permanently stored in KV.

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
