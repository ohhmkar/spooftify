# DBMS Mini Project
## Spooftify Database Management System

MERN port of `spotify_miniproject.sql`: same tables, CHECKs, FKs, 5 triggers and 3 views, running on MongoDB.

## Run

```bash
cd backend  && npm i && npm run db                    # MongoDB on :27017 as replica set rs0 (transactions need one)
mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'   # one time, first run only
cd backend  && npm run seed && npm run dev            # API on :5050 (:1312 if backend/.env says so)
cd frontend && npm i && npm run dev                   # UI on :3000
cd backend  && npm run check                          # ACID check on a scratch database (local only)
```

Using `brew services` instead? Add `replication: { replSetName: rs0 }` to its `mongod.conf`, restart, then run the same `rs.initiate`. Atlas is already a replica set.

Every seeded user logs in with the password `spooftify123` (for example `omkar@gmail.com`). New accounts: `/signup`.

`npm run media` (backend) backfills artist pictures and YouTube ids / view counts; `node add-to-catalog.js` adds the artists listed in `artists-to-add.txt` to `seed-data.json` (Deezer, iTunes and Wikipedia; resumable, never changes existing rows apart from filling in `bpm`).

`MONGODB_URI` / `PORT` (backend) and `NEXT_PUBLIC_API_URL` (frontend) override the defaults.

## Where the DBMS parts live

| SQL | Mongo | File |
| --- | --- | --- |
| Tables, PK, FK, CHECK | Mongoose schemas + validators, FK/RESTRICT hooks | `backend/models.js` |
| Triggers | Mongoose `pre`/`post` middleware, same names as the SQL | `backend/models.js` |
| Transactions (ACID) | every write route runs in a multi-document transaction (snapshot, majority), triggers included; `AUTO_INCREMENT` via a `Counters` collection | `backend/server.js` (`tx`), `backend/check-acid.js` |
| Views | Native `db.createView` aggregation pipelines | `backend/views.js` |
| Sample data | Real artists, albums and songs from `backend/seed-data.json` + users, playlists, listens, likes, follows | `backend/seed.js` |
| Accounts | scrypt password hashes, signed session cookie | `backend/auth.js`, `backend/server.js` |

The **DB Console** (`/db`) runs CRUD on every table, queries every view, and lists every trigger.

## Features

Playback (seek, volume, shuffle, repeat, queue, lyrics via LRCLIB), accounts, liked songs, follows (artists, users, playlists), playlist editing (rename, cover, reorder), albums, artist pages (bio, top tracks, listeners), and public stats (`/stats` and on every page).

**Playback.** Full songs play through the YouTube IFrame API; the video id is looked up on first play and cached in `Songs.youtube_id`. That lookup costs 100 of the 10,000 daily YouTube quota units, so on a big catalog some songs will fail to resolve. When that happens (no `YOUTUBE_API_KEY`, quota used up, video not embeddable) the player falls back to the 30-second iTunes preview and says so (`30s PREVIEW`). Space plays / pauses, from anywhere except a text field.

**Visualizer** (button next to the heart in the player bar): Bars, Battery, Alchemy and Scope. It follows the real audio when it can:
- the song is playing as a 30 s preview: it analyses that very audio element, nothing to click;
- full YouTube song: **Sync to audio** shares this tab's sound (Chrome / Edge; pick "This tab" and tick "Also share tab audio") and the whole song drives the visuals;
- otherwise it is beat-synced from the song's BPM and playback time (a simulated spectrum).

Search shows 100 songs / 12 of everything else per section; "Show all" / "Show more" raises it. Deleting a playlist is one transaction (`DELETE /api/playlists/:id`).
