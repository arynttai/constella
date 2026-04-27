const express = require("express");
const cors = require("cors");

const { createServer } = require("http");
const { WebSocketServer } = require("ws");

const { createStore } = require("./store");
const { matchTeamsWithTuning } = require("./matching");
const { makeDemoDataset, applyRandomEvent } = require("./demo");
const { TeamSizeSchema, StrategySchema, TuningSchema } = require("./schemas");
const { loadStore, saveStore } = require("./persist");
const { importParticipantsCsv, importEdgesCsv, ImportRequestSchema } = require("./importers");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const ORIGIN = process.env.CORSELLA_ORIGIN || process.env.ORIGIN || "*";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: ORIGIN === "*" ? true : ORIGIN,
    credentials: false,
  })
);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

const store = createStore();
const loaded = loadStore();
if (loaded?.dataset?.participants && loaded?.dataset?.edges) {
  store.setDataset(loaded.dataset);
  if (loaded.matchingConfig) store.setMatchingConfig(loaded.matchingConfig);
  if (loaded.constraints) store.setConstraints(loaded.constraints);
} else {
  store.setDataset(makeDemoDataset());
}

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function recomputeAndBroadcast(reason) {
  const dataset = store.getDataset();
  const cfg = store.getMatchingConfig();
  const result = matchTeamsWithTuning({
    participants: dataset.participants,
    edges: dataset.edges,
    teamSize: cfg.teamSize,
    strategy: cfg.strategy,
    tuning: cfg.tuning,
  });
  store.setLastResult(result);
  saveStore({
    dataset: store.getDataset(),
    matchingConfig: store.getMatchingConfig(),
    constraints: store.getConstraints(),
    updatedAt: Date.now(),
  });
  broadcast("teams.updated", { reason, result });
}

// ---- REST API ----
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "Constella", port: PORT });
});

app.get("/api/dataset", (_req, res) => {
  res.json(store.getDataset());
});

app.post("/api/dataset/demo", (_req, res) => {
  store.setDataset(makeDemoDataset());
  broadcast("graph.updated", { reason: "demo.regen" });
  recomputeAndBroadcast("demo.regen");
  res.json({ ok: true });
});

// --- CRUD: participants (минимально, для экрана "Участники") ---
app.get("/api/participants", (_req, res) => {
  res.json({ ok: true, participants: store.getDataset().participants, excluded: store.getConstraints().excludeIds || [] });
});

app.put("/api/participants/:id", (req, res) => {
  const id = String(req.params.id || "");
  const ds = store.getDataset();
  const idx = ds.participants.findIndex((p) => p.id === id);
  if (idx < 0) return res.status(404).json({ ok: false, error: "Not found" });
  const next = { ...ds.participants[idx], ...req.body, id };
  ds.participants[idx] = next;
  store.setDataset(ds);
  broadcast("graph.updated", { reason: "participant.updated", detail: { id } });
  recomputeAndBroadcast("participant.updated");
  res.json({ ok: true, participant: next });
});

app.post("/api/constraints/exclude", (req, res) => {
  const id = String(req.body?.id || "");
  const on = Boolean(req.body?.on);
  const cs = store.getConstraints();
  const set = new Set(cs.excludeIds || []);
  if (on) set.add(id);
  else set.delete(id);
  store.setConstraints({ excludeIds: [...set] });
  broadcast("graph.updated", { reason: "constraints.excluded", detail: { id, on } });
  recomputeAndBroadcast("constraints.excluded");
  res.json({ ok: true, constraints: store.getConstraints() });
});

// --- CSV import ---
app.post("/api/import/csv", (req, res) => {
  const parsed = ImportRequestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid payload", issues: parsed.error.issues });
  const { participantsCsv, edgesCsv, mode } = parsed.data;

  const ds = store.getDataset();
  let next = { ...ds };

  if (participantsCsv) {
    const imp = importParticipantsCsv(participantsCsv);
    if (!imp.ok) return res.status(400).json(imp);
    if (mode === "replace") next.participants = imp.participants;
    else {
      const byId = new Map(next.participants.map((p) => [p.id, p]));
      for (const p of imp.participants) byId.set(p.id, p);
      next.participants = [...byId.values()];
    }
  }

  if (edgesCsv) {
    const impE = importEdgesCsv(edgesCsv);
    if (!impE.ok) return res.status(400).json(impE);
    if (mode === "replace") next.edges = impE.edges;
    else next.edges = [...next.edges, ...impE.edges];
  }

  store.setDataset(next);
  broadcast("graph.updated", { reason: "import.csv", detail: { mode, participants: next.participants.length, edges: next.edges.length } });
  recomputeAndBroadcast("import.csv");
  res.json({ ok: true, dataset: store.getDataset() });
});

app.post("/api/matching/config", (req, res) => {
  const teamSize = TeamSizeSchema.safeParse(req.body?.teamSize);
  const strategy = StrategySchema.safeParse(req.body?.strategy);
  const tuning = TuningSchema.safeParse(req.body?.tuning || {});
  if (!teamSize.success || !strategy.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid config",
      issues: {
        teamSize: teamSize.success ? null : teamSize.error.issues,
        strategy: strategy.success ? null : strategy.error.issues,
      },
    });
  }
  store.setMatchingConfig({ teamSize: teamSize.data, strategy: strategy.data, tuning: { ...store.getMatchingConfig().tuning, ...(tuning.success ? tuning.data : {}) } });
  recomputeAndBroadcast("config.changed");
  res.json({ ok: true, config: store.getMatchingConfig() });
});

app.post("/api/matching/run", (req, res) => {
  const cfg = store.getMatchingConfig();
  const strategy = req.body?.strategy ? StrategySchema.safeParse(req.body.strategy) : { success: true, data: cfg.strategy };
  const teamSize = req.body?.teamSize ? TeamSizeSchema.safeParse(req.body.teamSize) : { success: true, data: cfg.teamSize };
  if (!strategy.success || !teamSize.success) {
    return res.status(400).json({ ok: false, error: "Invalid params" });
  }
  store.setMatchingConfig({ strategy: strategy.data, teamSize: teamSize.data });
  recomputeAndBroadcast("manual.run");
  res.json({ ok: true, result: store.getLastResult(), config: store.getMatchingConfig() });
});

app.get("/api/teams/current", (_req, res) => {
  const last = store.getLastResult();
  if (!last) recomputeAndBroadcast("cold.start");
  res.json({ ok: true, dataset: store.getDataset(), result: store.getLastResult(), config: store.getMatchingConfig() });
});

// ---- WebSocket ----
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", payload: { name: "Constella" }, ts: Date.now() }));
  ws.send(JSON.stringify({ type: "graph.updated", payload: { reason: "snapshot" }, ts: Date.now() }));
  ws.send(JSON.stringify({ type: "teams.updated", payload: { reason: "snapshot", result: store.getLastResult() }, ts: Date.now() }));
});

// ---- Demo real-time events ----
const RT_MS = process.env.RT_MS ? Number(process.env.RT_MS) : 2500;
setInterval(() => {
  const dataset = store.getDataset();
  const ev = applyRandomEvent(dataset);
  if (ev) {
    store.setDataset(dataset);
    broadcast("graph.updated", ev);
    recomputeAndBroadcast(ev.reason || "rt.event");
  }
}, RT_MS);

recomputeAndBroadcast("boot");

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Constella] server listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[Constella] ws on ws://localhost:${PORT}/ws`);
});

