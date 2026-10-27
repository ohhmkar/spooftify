# Spooftify

DBMS mini project: a Spotify-style music app. It is a MERN port of `spotify_miniproject.sql` that keeps the same tables, CHECKs, FKs, 5 triggers and 3 views, all running on MongoDB.

- `backend/`: Express 5 + Mongoose API
- `frontend/`: Next.js 16 (App Router) UI

## Run

Transactions need MongoDB running as a replica set.

```bash
cd backend && npm i && npm run db      # MongoDB on :27017 as replica set rs0
mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'   # first run only
cd backend && npm run seed && npm run dev    # API on :1312
cd frontend && npm i && npm run dev          # UI on :3000
```

If you use `brew services` instead, add `replication: { replSetName: rs0 }` to its `mongod.conf`, restart it, then run the same `rs.initiate`. Atlas is already a replica set.

Every seeded user logs in with the password `spooftify123` (for example `omkar@gmail.com`). New accounts sign up at `/signup`.

### Environment

| Variable | Where | Default |
| --- | --- | --- |
| `MONGODB_URI` | `backend/.env` | `mongodb://127.0.0.1:27017/spotify_miniproject` |
| `PORT` | `backend/.env` | `1312` |
| `SESSION_SECRET` | `backend/.env` | dev-only fallback (set it for anything public) |
| `YOUTUBE_API_KEY` | `backend/.env` | none (songs fall back to the 30 s preview) |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | `http://localhost:1312/api` |

### Checks (backend)

| Command | What it checks |
| --- | --- |
| `npm run check` | ACID: atomicity, isolation and AUTO_INCREMENT on a scratch database. It runs locally only and never reads `.env`. |
| `npm run check:api` | HTTP smoke test of the routes (logins, guards, validation). It undoes its own writes. |
| `npm run check:media` | Round trips for BinData photos and GridFS Canvas videos. It deletes its own test song. |

### Catalog scripts (backend)

- `npm run media` backfills artist pictures plus YouTube ids and view counts. It is resumable and stops cleanly when the quota runs out.
- `node add-to-catalog.js` adds the artists listed in `artists-to-add.txt` to `seed-data.json`, using Deezer, iTunes and Wikipedia. It is resumable and never changes existing rows apart from filling in `bpm`.

## Where the DBMS parts live

| SQL | Mongo | File |
| --- | --- | --- |
| Tables, PK, FK, CHECK | Mongoose schemas + validators, FK/RESTRICT hooks | `backend/models.js` |
| Triggers | Mongoose `pre`/`post` middleware, with the same names as in the SQL | `backend/models.js` |
| Transactions (ACID) | Every write route runs in a multi-document transaction (snapshot, majority), triggers included. `AUTO_INCREMENT` uses a `Counters` collection. | `backend/lib.js` (`tx`), `backend/check-acid.js` |
| TCL (`SAVEPOINT`, `ROLLBACK TO`) | Replayed transactions | `backend/routes/tx.js` |
| Views | Native `db.createView` aggregation pipelines | `backend/views.js` |
| Sample data | Real artists, albums and songs from `seed-data.json`, plus users, playlists, listens, likes and follows | `backend/seed.js` |
| Accounts | scrypt password hashes and a signed session cookie | `backend/auth.js`, `backend/routes/auth.js` |
| Media | Photos and covers stored as BinData in the document; Canvas videos stored in GridFS | `backend/routes/media.js` |

The **DB Console** (`/db`) runs CRUD on every table, queries every view, lists every trigger and runs transaction demos.

## Features

- **Playback:** seek, volume, shuffle, repeat, queue, lyrics (LRCLIB), song radio when the queue runs out, sleep timer, keyboard shortcuts and media keys
- **Library:** liked songs, follows (artists, users, playlists), playlist editing (rename, cover, reorder, collaborators), drag a song onto a sidebar playlist to add it
- **Pages:** albums, artists (bio, top tracks, listeners), public stats (`/stats`), your own listening stats (`/stats/you`), follow feed (`/feed`), share links

**Playback.** Full songs play through the YouTube IFrame API. The video id is looked up on first play and cached in `Songs.youtube_id`. Each lookup costs 100 of the 10,000 daily quota units, so on a big catalog some songs won't resolve. When that happens (no key, quota used up, or the video isn't embeddable), the player falls back to the 30-second iTunes preview and labels it `30s PREVIEW`.

**Shortcuts.** These work anywhere except in a text field: Space plays or pauses, ←/→ seek 5 s, Shift+↑/↓ change the volume, M mutes, and / focuses search.

**Visualizer** (the button next to the heart in the player bar) has four modes: Bars, Battery, Alchemy and Scope. It follows the real audio when it can:
- When the song is playing as a 30 s preview, it analyses that audio element directly.
- For a full YouTube song, **Sync to audio** shares this tab's sound (Chrome / Edge: pick "This tab" and tick "Also share tab audio").
- Otherwise it syncs to the beat using the song's BPM and the playback time, with a simulated spectrum.
