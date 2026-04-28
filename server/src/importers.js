const { z } = require("zod");
const { parseCsv } = require("./csv");
const { RoleSchema } = require("./schemas");

const RoleMap = {
  dev: "dev",
  developer: "dev",
  engineer: "dev",
  design: "design",
  designer: "design",
  data: "data",
  ml: "data",
  ai: "data",
  pm: "pm",
  product: "pm",
  biz: "biz",
  business: "biz",
};

function normRole(v) {
  const s = String(v || "").trim().toLowerCase();
  const mapped = RoleMap[s] || s;
  const parsed = RoleSchema.safeParse(mapped);
  return parsed.success ? parsed.data : null;
}

function toNum(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function importParticipantsCsv(text) {
  const { header, rows } = parseCsv(text);
  if (header.length === 0) return { ok: false, error: "Пустой CSV" };

  // ожидаемые колонки (гибко): id (опц), name, primaryRole, city, university, community, level (опц)
  const errors = [];
  const participants = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idRaw = r.id || r.ID || r.Id || "";
    const name = String(r.name || r.Name || r.fullName || r["full_name"] || "").trim();
    const primaryRole = normRole(r.primaryRole || r.role || r.Role || r.primary || "");
    const secondaryRole = normRole(r.secondaryRole || r.secondary || "");
    const city = String(r.city || r.City || "").trim();
    const university = String(r.university || r.uni || r.University || "").trim();
    const community = String(r.community || r.Community || "").trim();
    const level = toNum(r.level || r.Level || "", 0);

    if (!name) errors.push({ row: i + 2, field: "name", message: "name обязателен" });
    if (!primaryRole) errors.push({ row: i + 2, field: "primaryRole", message: "primaryRole обязателен (dev/design/data/pm/biz)" });
    if (!city) errors.push({ row: i + 2, field: "city", message: "city обязателен" });
    if (!university) errors.push({ row: i + 2, field: "university", message: "university обязателен" });
    if (!community) errors.push({ row: i + 2, field: "community", message: "community обязателен" });

    const id = String(idRaw).trim() || `p${i + 1}`;
    const skills = { dev: 0, design: 0, data: 0, pm: 0, biz: 0 };
    if (primaryRole) skills[primaryRole] = Math.max(1, Math.min(5, Math.round(level ? Math.min(5, level) : 3)));
    if (secondaryRole) skills[secondaryRole] = Math.max(skills[secondaryRole], 2);

    participants.push({
      id,
      name,
      primaryRole: primaryRole || "dev",
      secondaryRole: secondaryRole || null,
      city,
      university,
      community,
      style: { divergence: 0.5, structure: 0.5 },
      skills,
      level: level || 3,
    });
  }

  // unique ids
  const seen = new Set();
  for (const p of participants) {
    if (seen.has(p.id)) errors.push({ row: null, field: "id", message: `Дубликат id: ${p.id}` });
    seen.add(p.id);
  }

  if (errors.length) return { ok: false, error: "CSV не прошел валидацию", errors };
  return { ok: true, participants };
}

function importEdgesCsv(text) {
  const { header, rows } = parseCsv(text);
  if (header.length === 0) return { ok: false, error: "Пустой CSV" };
  const errors = [];
  const edges = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const a = String(r.a || r.A || r.from || r.source || "").trim();
    const b = String(r.b || r.B || r.to || r.target || "").trim();
    const w = toNum(r.w || r.weight || r.Weight || "", 0.2);
    const tagsRaw = String(r.tags || r.tag || "").trim();
    const tags = tagsRaw ? tagsRaw.split("|").map((s) => s.trim()).filter(Boolean) : [];
    if (!a) errors.push({ row: i + 2, field: "a", message: "a обязателен" });
    if (!b) errors.push({ row: i + 2, field: "b", message: "b обязателен" });
    edges.push({ a, b, w: Math.max(0, Math.min(1, w)), tags });
  }
  if (errors.length) return { ok: false, error: "CSV не прошел валидацию", errors };
  return { ok: true, edges };
}

const ImportRequestSchema = z.object({
  participantsCsv: z.string().min(1).optional(),
  edgesCsv: z.string().min(1).optional(),
  mode: z.enum(["replace", "merge"]).default("replace"),
});

module.exports = { importParticipantsCsv, importEdgesCsv, ImportRequestSchema };

