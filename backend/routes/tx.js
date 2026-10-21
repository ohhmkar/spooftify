// TCL demo for the DB Console
import express from "express";
import mongoose from "mongoose";
import { tables } from "../models.js";

const api = express.Router();
export default api;

// ---------- TCL demo: START TRANSACTION ... COMMIT / ROLLBACK (needs a replica set) ----------
// body: { ops: [{ op: "insert"|"update"|"delete", table, id?, doc? } | { op: "savepoint"|"rollback_to", name }], fail_at?: N }
// "$N" in id or doc = the _id step N inserted (like SET @stepN = LAST_INSERT_ID()), so presets need no hard-coded ids.
// Every op goes through the models, so CHECKs, FKs and triggers run inside the transaction and roll back with it.
// The trigger hooks' own queries (FK exists, MAX+1 id, after_contains_delete insert) carry no session; with
// transactionAsyncLocalStorage on (set at the top), Mongoose hands them the tx session.
const isRef = (v) => typeof v === "string" && /^\$\d+$/.test(v);
const sqlVal = (v) => (isRef(v) ? `@step${v.slice(1)}` : typeof v === "string" ? `'${v}'` : v === null || v === undefined ? "NULL" : typeof v === "object" ? `'${JSON.stringify(v)}'` : v);
const sqlOf = ({ op, table, id, doc = {}, name }) =>
  ({
    insert: () => `INSERT INTO ${table} (${Object.keys(doc).join(", ")}) VALUES (${Object.values(doc).map(sqlVal).join(", ")})`,
    update: () => `UPDATE ${table} SET ${Object.entries(doc).map(([k, v]) => `${k} = ${sqlVal(v)}`).join(", ")} WHERE _id = ${sqlVal(id)}`,
    delete: () => `DELETE FROM ${table} WHERE _id = ${sqlVal(id)}`,
    savepoint: () => `SAVEPOINT ${name}`,
    rollback_to: () => `ROLLBACK TO SAVEPOINT ${name}`,
  })[op]?.() ?? `?? unknown op ${op}`;
class Replay extends Error {} // thrown to abort the tx so it can be re-run without the rolled-back segment

api.post("/tx", async (req, res) => {
  const fail_at = req.body.fail_at == null || req.body.fail_at === "" ? null : +req.body.fail_at;
  let ops = (req.body.ops ?? []).map((o, i) => ({ ...o, step: i + 1 })); // step = position in the original list
  const log = [], touched = new Map(); // touched: "table:id" -> [table, id, op], for the after check
  let ids = {}; // step -> inserted _id, reset per attempt
  const ref = (v) => (isRef(v) ? (ids[v.slice(1)] ?? (() => { throw new Error(`${v}: step ${v.slice(1)} inserted no row`); })()) : v);
  const put = (sql, status, msg) => log.push({ sql, status, ...(msg && { msg }) });
  const run = async (o, session) => {
    const M = tables[o.table];
    if (!M) throw new Error(`No such table: ${o.table}`);
    const doc = Object.fromEntries(Object.entries(o.doc ?? {}).map(([k, v]) => [k, ref(v)])), id = ref(o.id);
    if (o.op === "insert") return (await M.create([doc], { session }))[0];
    const row = o.op === "update" ? await M.findById(id).session(session) : await M.findOneAndDelete({ _id: id }, { session });
    if (!row) throw new Error(`no row in ${o.table} with _id = ${id}`);
    if (o.op === "update") { const { _id, ...changes } = doc; await row.set(changes).save(); } // row carries the session
    return row;
  };
  let status, reason;
  for (;;) {
    const mark = log.length;
    try {
      await mongoose.connection.transaction(async (session) => {
        [log.length, ids] = [mark, {}]; // a driver retry (TransientTransactionError) re-runs this function: drop the failed attempt's lines
        put("START TRANSACTION", "info");
        for (const [i, o] of ops.entries()) {
          if (o.op === "savepoint") put(sqlOf(o), "info", "marker only (emulated: MongoDB has no SAVEPOINT)");
          else if (o.op === "rollback_to") {
            const s = ops.findIndex((p, j) => j < i && p.op === "savepoint" && p.name === o.name);
            if (s < 0) throw new Error(`SAVEPOINT ${o.name} does not exist`);
            put(sqlOf(o), "info", `emulated: MongoDB has no SAVEPOINT, so ABORT this transaction and replay steps ${ops.slice(0, s).map((p) => p.step).join(", ") || "(none)"} in a new one, then continue after step ${o.step}`);
            ops = [...ops.slice(0, s + 1), ...ops.slice(i + 1)];
            throw new Replay();
          } else {
            try {
              const row = await run(o, session);
              const id = typeof row._id === "number" ? row._id : String(row._id); // ObjectId -> hex string
              if (o.op === "insert") ids[o.step] = id;
              if (!touched.has(`${o.table}:${id}`)) touched.set(`${o.table}:${id}`, [o.table, id, o.op]);
              put(sqlOf(o), "ok", o.op === "insert" ? `1 row inserted, @step${o.step} = _id = ${id}` : `1 row ${o.op}d (_id = ${id})`);
            } catch (e) {
              put(sqlOf(o), "error", e.code === 11000 ? `Duplicate key: ${JSON.stringify(e.keyValue)}` : e.message);
              throw e;
            }
          }
          if (o.step === fail_at) throw new Error(`fail_at = ${fail_at}: deliberate error after step ${fail_at}`);
        }
      });
      [status, reason] = ["COMMIT", "all statements succeeded"];
    } catch (e) {
      if (e instanceof Replay) { put("ROLLBACK", "info", "transaction aborted (savepoint emulation); replaying"); continue; }
      [status, reason] = ["ROLLBACK", e.code === 11000 ? `Duplicate key: ${JSON.stringify(e.keyValue)}` : e.message];
    }
    break;
  }
  put(status, status === "COMMIT" ? "ok" : "error", reason);
  // after the transaction, outside it: are the rows really there?
  const after = await Promise.all([...touched.values()].map(async ([t, id, op]) => {
    const row = await tables[t].findById(id);
    return { sql: `SELECT * FROM ${t} WHERE _id = ${sqlVal(id)}`, rows: row ? 1 : 0, row, table: t, id, op };
  }));
  res.json({ status, reason, log, after });
});
