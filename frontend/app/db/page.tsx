"use client";
import { useCallback, useEffect, useState } from "react";
import { api, send, type Row } from "@/lib/api";

type Meta = {
  tables: string[];
  views: { name: string; on: string; pipeline: unknown[] }[];
  triggers: { name: string; event: string; action: string }[];
};
type Tab = { kind: "table" | "view"; name: string } | { kind: "triggers" } | { kind: "tx" };

const TRIGGER_DEMOS = [
  ["before_song_insert", "Songs → insert", '{ "song_name": "  new song  ", "duration": 200, "audio_file": "NS.MP3", "artist_id": 1 }'],
  ["before_user_insert", "User → insert", '{ "user_name": "test_u", "email": "TEST@GMAIL.COM", "phone": 9999999999, "password_hash": "x" }'],
  ["after_contains_delete", "Contains → delete any row", "then check Removed_Songs"],
  ["before_song_delete", "Songs → delete a song", "its Contains rows disappear and land in Removed_Songs"],
  ["before_contains_insert", "Contains → insert into a playlist with 50 songs", "fails with 'playlist is full'"],
];

export default function DbConsole() {
  const [meta, setMeta] = useState<Meta>();
  const [tab, setTab] = useState<Tab>({ kind: "table", name: "Songs" });
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch((e) => setErr(e.message));
  }, []);

  const btn = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-white text-black" : "bg-raised hover:bg-white/15"}`;
  const is = (kind: string, name?: string) => tab.kind === kind && (!name || ("name" in tab && tab.name === name));

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">DB Console</h1>
      <p className="mb-6 text-sm text-muted">spotify_miniproject on MongoDB — CRUD on tables, query views, fire triggers.</p>
      {err && <p className="mb-4 rounded bg-red-500/20 p-3 text-sm text-red-300">{err}</p>}
      {meta && (
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs text-muted uppercase">Tables</span>
            {meta.tables.map((t) => <button key={t} className={btn(is("table", t))} onClick={() => setTab({ kind: "table", name: t })}>{t}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs text-muted uppercase">Views</span>
            {meta.views.map((v) => <button key={v.name} className={btn(is("view", v.name))} onClick={() => setTab({ kind: "view", name: v.name })}>{v.name}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs text-muted uppercase">Triggers</span>
            <button className={btn(is("triggers"))} onClick={() => setTab({ kind: "triggers" })}>All {meta.triggers.length} triggers</button>
            <button className={btn(is("tx"))} onClick={() => setTab({ kind: "tx" })}>Transactions (TCL)</button>
          </div>
        </div>
      )}
      {meta && tab.kind === "triggers" && <Triggers meta={meta} />}
      {meta && tab.kind === "tx" && <Transactions meta={meta} />}
      {meta && (tab.kind === "table" || tab.kind === "view") && (
        <Grid key={tab.kind + tab.name} kind={tab.kind} name={tab.name} def={meta.views.find((v) => v.name === tab.name)} />
      )}
    </div>
  );
}

function Triggers({ meta }: { meta: Meta }) {
  return (
    <div className="space-y-3">
      {meta.triggers.map((t) => {
        const demo = TRIGGER_DEMOS.find((d) => d[0] === t.name);
        return (
          <div key={t.name} className="rounded-lg bg-raised p-4">
            <p className="font-mono font-bold text-accent">{t.name}</p>
            <p className="text-sm">{t.event} — <span className="font-mono text-muted">{t.action}</span></p>
            {demo && <p className="mt-2 text-xs text-muted">Try it: {demo[1]} <code className="text-white/80">{demo[2]}</code></p>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- TCL: START TRANSACTION ... COMMIT / ROLLBACK through POST /api/tx ----------
type Op = { op: "insert" | "update" | "delete" | "savepoint" | "rollback_to"; table?: string; id?: string | number; doc?: Row; name?: string };
type TxResult = {
  status: "COMMIT" | "ROLLBACK"; reason: string;
  log: { sql: string; status: "ok" | "error" | "info"; msg?: string }[];
  after: { sql: string; rows: number; row: Row | null; table: string; id: string | number; op: Op["op"] }[];
};
// "$N" = the _id inserted by step N (backend logs it as @stepN), so presets need no hard-coded ids; n keeps unique columns unique
const song = (song_name: string): Op => ({ op: "insert", table: "Songs", doc: { song_name, duration: 200, audio_file: "TX.MP3", artist_id: 1 } });
const TX_PRESETS: [string, (n: number) => Op[], number?][] = [
  ["Add 2 songs to a playlist, then fail", () => [song("  tx song one "), song("tx song two"),
    { op: "insert", table: "Contains", doc: { playlist_id: 1, song_id: "$1" } }, { op: "insert", table: "Contains", doc: { playlist_id: 1, song_id: "$2" } }], 4],
  ["Create user + playlist atomically", (n) => [
    { op: "insert", table: "User", doc: { user_name: `tx_${n}`, email: `TX_${n}@GMAIL.COM`, phone: 8000000000 + n, password_hash: "x" } },
    { op: "insert", table: "Playlist", doc: { playlist_name: "ATOMIC MIX", is_public: true, user_id: "$1" } }]],
  ["CHECK violation mid-way", () => [song("fine song"), { op: "insert", table: "Songs", doc: { song_name: "bad", duration: 0, audio_file: "B.MP3", artist_id: 1 } }]],
  ["Delete a song (triggers cascade), then fail", () => [{ op: "delete", table: "Songs", id: 1 }], 1],
  ["SAVEPOINT + ROLLBACK TO (emulated)", (n) => [
    { op: "insert", table: "Genre", doc: { genre_name: `TCL KEPT ${n}` } }, { op: "savepoint", name: "a" },
    { op: "insert", table: "Genre", doc: { genre_name: `TCL UNDONE ${n}` } }, { op: "rollback_to", name: "a" }]],
];
const opText = (o: Op) =>
  o.op === "savepoint" ? `SAVEPOINT ${o.name}` : o.op === "rollback_to" ? `ROLLBACK TO SAVEPOINT ${o.name}`
    : `${o.op.toUpperCase()} ${o.table}${o.id !== undefined ? ` WHERE _id = ${o.id}` : ""}${o.doc ? " " + JSON.stringify(o.doc) : ""}`;

function Transactions({ meta }: { meta: Meta }) {
  const [ops, setOps] = useState<Op[]>([]);
  const [failAt, setFailAt] = useState("");
  const [draft, setDraft] = useState({ op: "insert" as Op["op"], table: "Songs", id: "", json: "{}", name: "" });
  const [res, setRes] = useState<TxResult>();
  const [err, setErr] = useState("");
  const marker = draft.op === "savepoint" || draft.op === "rollback_to";

  const add = () => {
    let doc: Row | undefined;
    if (draft.op === "insert" || draft.op === "update") { try { doc = JSON.parse(draft.json); } catch { return setErr("Invalid JSON"); } }
    const id = draft.id !== "" && !isNaN(+draft.id) ? +draft.id : draft.id;
    setOps([...ops, marker ? { op: draft.op, name: draft.name || "sp1" } : { op: draft.op, table: draft.table, ...(draft.op !== "insert" && { id }), ...(doc && { doc }) }]);
    setErr("");
  };
  const run = (list = ops, fail = failAt) =>
    send("POST", "/tx", { ops: list, fail_at: fail === "" ? undefined : +fail }).then((r) => { setRes(r as TxResult); setErr(""); }).catch((e) => setErr(e.message));
  // undo a COMMIT: DELETE the rows it inserted, newest first (children before parents, so RESTRICT is happy)
  const undo = res?.status === "COMMIT" ? res.after.filter((a) => a.op === "insert" && a.rows).reverse().map((a): Op => ({ op: "delete", table: a.table, id: a.id })) : [];
  const color = { ok: "text-accent", error: "text-red-400", info: "text-muted" };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Every statement runs inside one MongoDB transaction (<code>connection.transaction()</code>), through the models, so CHECKs, FKs and triggers fire and roll back with it.
        MongoDB has no SAVEPOINT: <code>ROLLBACK TO</code> is emulated by aborting and replaying the statements before the savepoint.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-xs text-muted uppercase">Presets</span>
        {TX_PRESETS.map(([label, make, fail]) => (
          <button key={label} className="rounded-full bg-raised px-3 py-1 text-sm hover:bg-white/15"
            onClick={() => { const list = make(Date.now() % 1e8); setOps(list); setFailAt(fail ? String(fail) : ""); run(list, fail ? String(fail) : ""); }}>{label}</button>
        ))}
      </div>
      <div className="rounded-lg bg-raised p-4">
        <p className="mb-2 text-sm font-bold">Statements</p>
        {ops.length === 0 && <p className="text-xs text-muted">None yet: add one below or pick a preset.</p>}
        <ol className="space-y-1">
          {ops.map((o, i) => (
            <li key={i} className="flex items-center gap-2 font-mono text-xs">
              <span className="w-6 text-muted">{i + 1}.</span>
              <span className="truncate">{opText(o)}</span>
              <button className="ml-auto text-red-400 hover:text-red-300" onClick={() => setOps(ops.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-white/10 pt-3">
          <select value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as Op["op"] })} aria-label="Statement" className="rounded bg-white/10 px-2 py-2 text-sm">
            {["insert", "update", "delete", "savepoint", "rollback_to"].map((o) => <option key={o} value={o}>{o.toUpperCase().replace("_", " ")}</option>)}
          </select>
          {marker ? (
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="savepoint name" aria-label="Savepoint name" className="w-40 rounded bg-white/10 px-3 py-2 font-mono text-sm" />
          ) : (
            <>
              <select value={draft.table} onChange={(e) => setDraft({ ...draft, table: e.target.value })} aria-label="Table" className="rounded bg-white/10 px-2 py-2 text-sm">
                {meta.tables.map((t) => <option key={t}>{t}</option>)}
              </select>
              {draft.op !== "insert" && <input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="_id" aria-label="Row id" className="w-28 rounded bg-white/10 px-3 py-2 font-mono text-sm" />}
              {draft.op !== "delete" && <textarea value={draft.json} onChange={(e) => setDraft({ ...draft, json: e.target.value })} rows={2} aria-label="Row JSON" className="min-w-64 flex-1 rounded bg-black/40 p-2 font-mono text-xs" />}
            </>
          )}
          <button onClick={add} className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/15">+ Add</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={failAt} onChange={(e) => setFailAt(e.target.value)} placeholder="fail after step N (optional)" aria-label="Fail at step" className="w-56 rounded bg-white/10 px-3 py-2 font-mono text-sm" />
          <button onClick={() => setOps([])} className="rounded-full bg-white/10 px-4 py-2 text-sm">Clear</button>
          <button onClick={() => run()} disabled={!ops.length} className="ml-auto rounded-full bg-accent px-4 py-2 text-sm font-bold text-black disabled:opacity-40">Run transaction</button>
        </div>
      </div>
      {err && <p className="rounded bg-red-500/20 p-3 text-sm text-red-300">{err}</p>}
      {res && (
        <div ref={(el) => el?.scrollIntoView({ behavior: "smooth", block: "nearest" })} className="rounded-lg border border-white/10 bg-black/60 p-4 font-mono text-xs leading-relaxed">
          {res.log.map((l, i) => (
            <div key={i} className={/^(START|COMMIT|ROLLBACK$)/.test(l.sql) ? "font-bold" : ""}>
              <span className="text-muted">mongo&gt; </span>{l.sql};
              {l.msg && <div className={`pl-8 ${color[l.status]}`}>{l.status === "error" ? "ERROR: " : "-- "}{l.msg}</div>}
            </div>
          ))}
          <p className={`mt-3 text-sm font-bold ${res.status === "COMMIT" ? "text-accent" : "text-red-400"}`}>{res.status}: {res.reason}</p>
          {undo.length > 0 && (
            <button onClick={() => { setOps(undo); setFailAt(""); run(undo, ""); }} className="mt-2 rounded-full bg-white/10 px-3 py-1 font-sans text-xs hover:bg-white/15">
              Undo: DELETE the {undo.length} inserted row{undo.length === 1 ? "" : "s"} in a new transaction
            </button>
          )}
          {res.after.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-1 text-muted">-- after the transaction (outside it): are the rows there?</p>
              {res.after.map((a) => (
                <div key={a.sql}><span className="text-muted">mongo&gt; </span>{a.sql}; <span className={a.rows ? "text-accent" : "text-red-400"}>{a.rows} row{a.rows === 1 ? "" : "s"}</span>
                  {a.row && <span className="text-muted"> {JSON.stringify(a.row)}</span>}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Grid({ kind, name, def }: { kind: "table" | "view"; name: string; def?: Meta["views"][number] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<{ id?: unknown; json: string } | null>(null);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(200); // the page is not asked to draw 2000+ rows at once
  const base = kind === "view" ? `/views/${name}` : `/${name}`;

  const load = useCallback(() => {
    api(base + (filter ? `?${filter}` : ""))
      .then((r) => { setRows(r); setErr(""); })
      .catch((e) => setErr(e.message));
  }, [base, filter]);
  useEffect(load, [load]);

  const act = (p: Promise<unknown>) => p.then(() => { setDraft(null); load(); }).catch((e) => setErr(e.message));
  const save = () => {
    let body: Row;
    try { body = JSON.parse(draft!.json); } catch { return setErr("Invalid JSON"); }
    act(draft!.id === undefined ? send("POST", `/${name}`, body) : send("PUT", `/${name}/${draft!.id}`, body));
  };
  const template = () => {
    const { _id, ...rest } = rows[0] ?? {};
    void _id;
    return JSON.stringify(Object.fromEntries(Object.keys(rest).map((k) => [k, ""])), null, 2);
  };
  const cols = [...new Set(rows.flatMap(Object.keys))];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          defaultValue={filter}
          onKeyDown={(e) => { if (e.key === "Enter") { setFilter(e.currentTarget.value); setShown(200); } }}
          placeholder="WHERE  e.g. artist_id=1&country=IN  (Enter)"
          aria-label="Filter"
          className="w-80 rounded bg-white/10 px-3 py-2 font-mono text-sm"
        />
        <span className="text-sm text-muted">{rows.length} rows{kind === "table" && rows.length >= 1000 && " (the API sends the first 1000: filter to narrow)"}{rows.length > shown && `, showing ${shown}`}</span>
        {kind === "table" && (
          <button onClick={() => setDraft({ json: template() })} className="ml-auto rounded-full bg-accent px-4 py-2 text-sm font-bold text-black">
            + Insert row
          </button>
        )}
      </div>
      {def && (
        <details className="mb-3 rounded bg-raised p-3 text-sm">
          <summary className="cursor-pointer text-muted">View definition — db.createView(&quot;{def.name}&quot;, &quot;{def.on}&quot;, pipeline)</summary>
          <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(def.pipeline, null, 2)}</pre>
        </details>
      )}
      {err && <p className="mb-3 rounded bg-red-500/20 p-3 text-sm text-red-300">{err}</p>}
      {draft && (
        <div ref={(el) => el?.scrollIntoView({ block: "nearest" })} className="mb-3 rounded bg-raised p-3">
          <p className="mb-2 text-sm font-bold">{draft.id === undefined ? `INSERT INTO ${name}` : `UPDATE ${name} WHERE _id = ${draft.id}`}</p>
          <textarea value={draft.json} onChange={(e) => setDraft({ ...draft, json: e.target.value })} rows={8} aria-label="Row JSON"
            className="w-full rounded bg-black/40 p-2 font-mono text-xs" />
          <div className="mt-2 flex gap-2">
            <button onClick={save} className="rounded-full bg-accent px-4 py-1 text-sm font-bold text-black">Save</button>
            <button onClick={() => setDraft(null)} className="rounded-full bg-white/10 px-4 py-1 text-sm">Cancel</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-raised text-muted">
            <tr>
              {cols.map((c) => <th key={c} className="px-3 py-2 font-mono font-normal whitespace-nowrap">{c}</th>)}
              {kind === "table" && <th className="sticky right-0 bg-raised" />}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r, i) => (
              <tr key={String(r._id ?? i)} className="border-t border-white/5 hover:bg-white/5">
                {cols.map((c) => <td key={c} className="max-w-64 truncate px-3 py-1.5 font-mono text-xs">{fmt(r[c])}</td>)}
                {kind === "table" && (
                  <td className="sticky right-0 bg-panel px-3 whitespace-nowrap shadow-[-8px_0_8px_-8px_#000]">
                    <button className="mr-3 text-xs text-muted hover:text-white" onClick={() => {
                      const { _id, ...rest } = r;
                      setDraft({ id: _id, json: JSON.stringify(rest, null, 2) });
                    }}>Edit</button>
                    <button className="text-xs text-red-400 hover:text-red-300" onClick={() => confirm(`DELETE FROM ${name} WHERE _id = ${r._id}?`) && act(send("DELETE", `/${name}/${r._id}`))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button onClick={() => setShown(shown + 500)} className="mt-3 rounded-full bg-raised px-5 py-2 text-sm font-bold hover:bg-white/15">Show {Math.min(500, rows.length - shown)} more rows</button>
      )}
    </div>
  );
}

const fmt = (v: unknown) => (v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
