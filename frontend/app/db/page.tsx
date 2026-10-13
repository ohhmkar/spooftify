"use client";
import { useCallback, useEffect, useState } from "react";
import { api, send, type Row } from "@/lib/api";

type Meta = {
  tables: string[];
  views: { name: string; on: string; pipeline: unknown[] }[];
  triggers: { name: string; event: string; action: string }[];
};
type Tab = { kind: "table" | "view"; name: string } | { kind: "triggers" };

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
          </div>
        </div>
      )}
      {meta && tab.kind === "triggers" && <Triggers meta={meta} />}
      {meta && tab.kind !== "triggers" && (
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

function Grid({ kind, name, def }: { kind: "table" | "view"; name: string; def?: Meta["views"][number] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<{ id?: unknown; json: string } | null>(null);
  const [err, setErr] = useState("");
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
          onKeyDown={(e) => e.key === "Enter" && setFilter(e.currentTarget.value)}
          placeholder="WHERE  e.g. artist_id=1&country=IN  (Enter)"
          aria-label="Filter"
          className="w-80 rounded bg-white/10 px-3 py-2 font-mono text-sm"
        />
        <span className="text-sm text-muted">{rows.length} rows</span>
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
        <div className="mb-3 rounded bg-raised p-3">
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
              {kind === "table" && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r._id ?? i)} className="border-t border-white/5 hover:bg-white/5">
                {cols.map((c) => <td key={c} className="max-w-64 truncate px-3 py-1.5 font-mono text-xs">{fmt(r[c])}</td>)}
                {kind === "table" && (
                  <td className="px-3 whitespace-nowrap">
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
    </div>
  );
}

const fmt = (v: unknown) => (v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
