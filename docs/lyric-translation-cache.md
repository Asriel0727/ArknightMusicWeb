# Lyric translation persistence

## Storage flow

1. `POST /api/lyrics/translate` receives `songId`, `locale`, and lyric lines.
2. The Worker hashes the ordered source lines with SHA-256.
3. It reads the whole-song record from Workers KV.
4. On a KV miss, it reads `music_lyric_translations` from Supabase.
5. On a persistent-cache miss, it translates in language-homogeneous batches.
6. The complete aligned translation array is written once to KV and once to Supabase.

Each Supabase row represents one complete song and target locale. `source_lyrics` and
`translated_lyrics` store the full text, while `translations` keeps the aligned array
needed by the timed lyric player. Lyrics are not stored as one database row per line.

The KV key format is:

```text
lyricsTranslation:song:v2:{songId}:{lyricsHash}:{targetLocale}
```

The old per-line KV cache remains available only for requests without a `songId`.

## Supabase setup

Run `docs/music-lyric-translations-schema.sql` in the Supabase SQL editor before deploying the Worker. The Worker uses `SUPABASE_SERVICE_ROLE_KEY`; browser clients have no direct access to this table.

## Scheduled prewarming

The existing Wrangler cron runs every six hours. Each run prioritizes up to five newly discovered songs by default, then uses any remaining capacity to rotate through the music catalog. The limit keeps KV, Supabase, lyric, and translation subrequests bounded while filling the persistent cache gradually.

Default target locales are configured by:

```toml
LYRICS_PREWARM_LOCALES = "zh-TW,zh-CN,en,ja,ko"
```

Manual prewarming requires the existing admin bearer token:

```text
POST /api/admin/prewarm-lyrics?limit=5&locales=zh-TW,zh-CN,en,ja,ko
Authorization: Bearer <SYNC_TOKEN>
```

The regular music sync endpoint also accepts:

```text
lyricsTranslationLimit=5
lyricsTranslationLocales=zh-TW,zh-CN,en,ja,ko
```

The prewarm limit is capped at five songs per invocation to keep translation and storage subrequests bounded.
