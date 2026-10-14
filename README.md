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

`npm run media` (backend) backfills artist pictures and YouTube ids / view counts; `node build-seed-data.js` rebuilds `seed-data.json` from Deezer, iTunes and Wikipedia.

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
