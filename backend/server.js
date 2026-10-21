import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { tables, triggers } from "./models.js";
import { views, createViews } from "./views.js";
import { TX } from "./lib.js";
import catalog from "./routes/catalog.js";
import auth from "./routes/auth.js";
import me from "./routes/me.js";
import playlists from "./routes/playlists.js";
import media from "./routes/media.js";
import txDemo from "./routes/tx.js";
import crud from "./routes/crud.js";

const PORT = process.env.PORT ?? 5050;
mongoose.set("transactionAsyncLocalStorage", true); // every query inside connection.transaction(fn), triggers included, joins its session
await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotify_miniproject");
await createViews(mongoose.connection.db);

const app = express();
app.use(cors(), express.json());
const api = express.Router();
app.use("/api", api);

// every route a tx() handler serves, found by walking the routers (all mounted at /, so a route's path is its full path)
const txRoutes = (stack) =>
  stack.flatMap((l) => (l.route ? (l.route.stack.some((s) => s.handle.tx) ? [`${Object.keys(l.route.methods)[0].toUpperCase()} /api${l.route.path}`] : []) : l.handle?.stack ? txRoutes(l.handle.stack) : []));
api.get("/meta", (req, res) =>
  res.json({ tables: Object.keys(tables), views: Object.entries(views).map(([name, v]) => ({ name, ...v })), triggers, transactions: { ...TX, routes: txRoutes(api.stack) } }),
);

// order matters: auth sets req.user for everything after it, and crud's /:table catches whatever is left
api.use(catalog, auth, me, playlists, media, txDemo, crud);

// what a UNIQUE / PRIMARY KEY violation means for the person who clicked, picked by the columns of the index that fired
const DUPES = [
  [["playlist_id", "song_id"], "That song is already in this playlist"], [["user_id", "song_id"], "Already in your Liked Songs"],
  [["user_id", "kind", "target_id"], "You already follow that"], [["playlist_id", "user_id"], "Already a collaborator on this playlist"],
  [["email"], "That email is already registered"], [["phone"], "That phone number is already registered"], [["genre_name"], "That genre already exists"],
];
const friendly = (err) => {
  if (err.code === 11000) return DUPES.find(([cols]) => cols.every((c) => c in (err.keyPattern ?? {})))?.[1] ?? `Duplicate key: ${JSON.stringify(err.keyValue)}`;
  if (err.name === "ValidationError")
    return Object.values(err.errors).map((e) => e.message.replace(/Path `(\w+)`/g, "$1").replace(/ \(`.*`, length \d+\) is longer than the maximum allowed length \((\d+)\)\./, " must be $1 characters or fewer").replace(/^check_\w+: /, "")).join("; ");
  return err.message === "playlist is full" ? "This playlist is full (50 songs max)" : err.message;
};
app.use((err, req, res, next) => {
  res.status(400).json({ error: friendly(err) });
});

// Vercel imports the app; locally we listen
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`API on http://localhost:${PORT}/api`));
export default app;
