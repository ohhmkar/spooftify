// generic CRUD on every table (the DB Console and a few app forms use it)
import express from "express";
import { tables } from "../models.js";
import { tx, where } from "../lib.js";

const api = express.Router();
export default api;

// ---------- GENERIC CRUD on tables ----------
// update = load + set + save and delete = findOneAndDelete, so the triggers fire
api.param("table", (req, res, next, t) => {
  req.Model = tables[t];
  req.Model ? next() : res.status(404).json({ error: `No such table: ${t}` });
});
// ?_limit=N&_skip=M pages through big tables (Listens grows with every play); X-Total-Count says how many rows match
api.get("/:table", async (req, res) => {
  const { _limit, _skip, ...q } = req.query;
  const filter = where(q);
  const [rows, total] = await Promise.all([
    req.Model.find(filter).sort({ _id: 1 }).skip(Math.max(+_skip || 0, 0)).limit(Math.min(Math.max(+_limit || 1000, 1), 5000)),
    req.Model.countDocuments(filter),
  ]);
  res.set("X-Total-Count", String(total)).json(rows);
});
api.get("/:table/:id", async (req, res) => {
  const doc = await req.Model.findById(req.params.id);
  doc ? res.json(doc) : res.status(404).json({ error: "Not found" });
});
api.post("/:table", tx(async (req, res) => res.status(201).json(await req.Model.create(req.body))));
api.put("/:table/:id", tx(async (req, res) => {
  const doc = await req.Model.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  const { _id, ...changes } = req.body;
  res.json(await doc.set(changes).save());
}));
api.delete("/:table/:id", tx(async (req, res) => {
  const doc = await req.Model.findOneAndDelete({ _id: req.params.id });
  doc ? res.json(doc) : res.status(404).json({ error: "Not found" });
}));
