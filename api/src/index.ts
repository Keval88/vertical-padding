// ─────────────────────────────────────────────────────────
// src/index.ts  –  Express + SQLite backend
// ─────────────────────────────────────────────────────────
import express, { Request, Response } from "express";
import Database from "better-sqlite3";
// @ts-ignore  ← the stub will also silence this, but keep it explicit
import NodeGeocoder from "node-geocoder";
import axios from "axios";
import path from "path";
import cors from "cors";


// ─── basic setup ─────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, "..", "padding.db"));
db.pragma("journal_mode = WAL");

// two tables: buildings (cache) and runs (log)
db.exec(`
  CREATE TABLE IF NOT EXISTS buildings (
    addr_hash TEXT PRIMARY KEY,
    floor_count INTEGER,
    is_office INTEGER
  );
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT,
    horizontal_sec INTEGER,
    floor_count INTEGER,
    is_office INTEGER,
    vertical_pad INTEGER,
    total_sec INTEGER,
    ts INTEGER
  );
`);

// helper libs
const geocoder = NodeGeocoder({ provider: "openstreetmap" });

// padding constants
const base = 60,
  perFloor = 10,
  office = 30,
  peak = 20;

// ─── POST /padStop ───────────────────────────────────────
app.post("/padStop", async (req: Request, res: Response) => {
  try {
    const { address, horizontal_time_sec = 0, is_peak = false } = req.body;
    if (!address) return res.status(400).send("address required");

    const addrHash = Buffer.from(address).toString("base64url");
    let meta: any = db
      .prepare("SELECT floor_count, is_office FROM buildings WHERE addr_hash = ?")
      .get(addrHash);

    // ── cache miss: fetch data from OpenStreetMap ──
    if (!meta) {
      const [geo] = await geocoder.geocode(address);
      const { latitude, longitude } = geo;

      const q = `[out:json];
        (way["building"](around:10,${latitude},${longitude}););
        out tags;`;
      const { data } = await axios.post(
        "https://overpass-api.de/api/interpreter",
        q,
        { headers: { "Content-Type": "text/plain" } }
      );
      const tags = data.elements[0]?.tags || {};
      meta = {
        floor_count: parseInt(tags["building:levels"]) || 5,
        is_office: /(office|commercial)/i.test(tags["building"] || ""),
      };
      db.prepare(
        "INSERT INTO buildings (addr_hash, floor_count, is_office) VALUES (?, ?, ?)"
      ).run(addrHash, meta.floor_count, meta.is_office ? 1 : 0);
    }

    // ── padding math ──
    let pad =
      base +
      perFloor * meta.floor_count +
      (meta.is_office ? office : 0) +
      (is_peak ? peak : 0);
    const total = horizontal_time_sec + pad;

    // log the call
    db.prepare(
      `INSERT INTO runs
         (address, horizontal_sec, floor_count, is_office,
          vertical_pad, total_sec, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      address,
      horizontal_time_sec,
      meta.floor_count,
      meta.is_office ? 1 : 0,
      pad,
      total,
      Date.now()
    );

    res.json({ ...meta, vertical_pad: pad, total_sec: total });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// ─── start the server ───────────────────────────────────
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
