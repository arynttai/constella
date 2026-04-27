function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

const ROLE_POOL = ["dev", "design", "data", "pm", "biz"];
const CITY_POOL = [
  "Алматы",
  "Астана",
  "Шымкент",
  "Караганда",
  "Актобе",
  "Тараз",
  "Павлодар",
  "Өскемен",
  "Қостанай",
  "Атырау",
];
const UNI_POOL = [
  "Назарбаев Университет (NU)",
  "КазНУ им. аль‑Фараби",
  "КБТУ",
  "Astana IT University",
  "Satbayev University",
  "ENU им. Л.Н. Гумилёва",
  "SDU University",
  "IITU (МУИТ)",
  "KIMEP University",
  "KarTU (Карагандинский тех. университет)",
];
const COMMUNITY_POOL = [
  "nFactorial",
  "QazTech",
  "Open Source KZ",
  "Design KZ",
  "AI Kazakhstan",
  "Product KZ",
  "Startup KZ",
  "GDG Almaty",
  "GDG Astana",
];

function genParticipants(n, seed) {
  const rng = mulberry32(seed);
  const firstNames = [
    "Айгерім",
    "Нұрсұлтан",
    "Әлихан",
    "Аружан",
    "Мәдина",
    "Данияр",
    "Ернар",
    "Томирис",
    "Диас",
    "Нұрай",
    "Жансая",
    "Санжар",
    "Бекзат",
    "Мирас",
    "Аяла",
    "Алан",
    "Ерасыл",
    "Амина",
    "Іңкәр",
    "Сымбат",
    "Нәзерке",
    "Айдос",
    "Ерке",
    "Арман",
    "Жанель",
    "Фариза",
  ];
  const lastNames = [
    "Серікұлы",
    "Нұрбекова",
    "Қасымов",
    "Сағындықова",
    "Төлегенов",
    "Ерланқызы",
    "Әбдірахманов",
    "Бекенова",
    "Жүнісова",
    "Сейітов",
    "Омарова",
    "Иманбек",
    "Жақсыбаев",
    "Қуанышқызы",
    "Мұратов",
    "Сәбитқызы",
  ];
  const clusters = [
    { id: "A", roleBias: "dev", cityBias: "Алматы", uniBias: "КБТУ", commBias: "Open Source KZ" },
    { id: "B", roleBias: "design", cityBias: "Алматы", uniBias: "KIMEP University", commBias: "Design KZ" },
    { id: "C", roleBias: "data", cityBias: "Астана", uniBias: "Назарбаев Университет (NU)", commBias: "AI Kazakhstan" },
    { id: "D", roleBias: "pm", cityBias: "Астана", uniBias: "Astana IT University", commBias: "Product KZ" },
  ];

  const participants = [];
  for (let i = 0; i < n; i++) {
    const cl = clusters[Math.floor(rng() * clusters.length)];
    const name = `${pick(rng, firstNames)} ${pick(rng, lastNames)}`;
    const primaryRole = rng() < 0.58 ? cl.roleBias : pick(rng, ROLE_POOL);
    const secondaryRole = rng() < 0.35 ? pick(rng, ROLE_POOL.filter((r) => r !== primaryRole)) : null;
    const city = rng() < 0.65 ? cl.cityBias : pick(rng, CITY_POOL);
    const university = rng() < 0.62 ? cl.uniBias : pick(rng, UNI_POOL);
    const community = rng() < 0.68 ? cl.commBias : pick(rng, COMMUNITY_POOL);

    const divergence = clamp01((rng() + (primaryRole === "design" ? 0.15 : 0)) * 0.95);
    const structure = clamp01((rng() + (primaryRole === "pm" ? 0.15 : 0)) * 0.95);

    const base = 1 + Math.floor(rng() * 4); // 1..4
    const skills = {};
    for (const role of ROLE_POOL) skills[role] = 0;
    skills[primaryRole] = Math.min(5, base + (rng() < 0.25 ? 1 : 0));
    if (secondaryRole) skills[secondaryRole] = Math.min(4, 1 + Math.floor(rng() * 3));
    const level = Math.round((skills.dev * 1.0 + skills.design * 0.9 + skills.data * 1.0 + skills.pm * 0.85 + skills.biz * 0.8 + rng() * 1.4) * 10) / 10;

    participants.push({
      id: `p${i + 1}`,
      name,
      clusterHint: cl.id,
      primaryRole,
      secondaryRole,
      city,
      university,
      community,
      style: { divergence, structure },
      skills,
      level,
    });
  }
  return participants;
}

function makeEdges(participants, seed) {
  const rng = mulberry32(seed);
  const edges = [];

  function addEdge(a, b, type, w) {
    if (a === b) return;
    edges.push({ a, b, type, w });
  }

  const clusterGroups = new Map();
  for (const p of participants) {
    if (!clusterGroups.has(p.clusterHint)) clusterGroups.set(p.clusterHint, []);
    clusterGroups.get(p.clusterHint).push(p.id);
  }
  for (const [, ids] of clusterGroups) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (rng() < 0.28) addEdge(ids[i], ids[j], "worked", 0.55 + rng() * 0.45);
      }
    }
  }

  const byAttr = (key) => {
    const map = new Map();
    for (const p of participants) {
      const v = p[key];
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(p.id);
    }
    return map;
  };
  const uniGroups = byAttr("university");
  const commGroups = byAttr("community");
  const cityGroups = byAttr("city");

  for (const [, ids] of uniGroups) {
    if (ids.length < 3) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (rng() < 0.07) addEdge(ids[i], ids[j], "uni", 0.18 + rng() * 0.22);
  }
  for (const [, ids] of commGroups) {
    if (ids.length < 3) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (rng() < 0.08) addEdge(ids[i], ids[j], "community", 0.14 + rng() * 0.20);
  }
  for (const [, ids] of cityGroups) {
    if (ids.length < 3) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (rng() < 0.05) addEdge(ids[i], ids[j], "city", 0.10 + rng() * 0.18);
  }

  // merge to simple edge with tags
  const merged = new Map();
  for (const e of edges) {
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    const prev = merged.get(key) || { a: e.a, b: e.b, w: 0, tags: new Set() };
    prev.w = Math.min(1, prev.w + e.w * (e.type === "worked" ? 1 : 0.6));
    prev.tags.add(e.type);
    merged.set(key, prev);
  }
  return [...merged.values()].map((x) => ({ a: x.a, b: x.b, w: x.w, tags: [...x.tags] }));
}

function makeDemoDataset() {
  const seed = (Date.now() >>> 0) % 1000000;
  const participants = genParticipants(28, seed);
  const edges = makeEdges(participants, seed ^ 0xabcdef);
  return { seed, participants, edges };
}

function applyRandomEvent(dataset) {
  const rng = mulberry32(((Date.now() >>> 0) ^ 0x1234567) >>> 0);
  const p = dataset.participants[Math.floor(rng() * dataset.participants.length)];
  if (!p) return null;

  const what = rng();
  if (what < 0.45) {
    const old = `${p.city}/${p.community}`;
    if (rng() < 0.5) p.city = pick(rng, CITY_POOL);
    else p.community = pick(rng, COMMUNITY_POOL);
    const neu = `${p.city}/${p.community}`;
    return { reason: "rt.profile", detail: { id: p.id, name: p.name, from: old, to: neu } };
  }

  const a = dataset.participants[Math.floor(rng() * dataset.participants.length)];
  const b = dataset.participants[Math.floor(rng() * dataset.participants.length)];
  if (!a || !b || a.id === b.id) return null;

  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  const idx = dataset.edges.findIndex((e) => (e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`) === key);
  if (idx >= 0) {
    const old = dataset.edges[idx].w;
    dataset.edges[idx].w = Math.min(1, old + 0.12);
    dataset.edges[idx].tags = Array.from(new Set([...(dataset.edges[idx].tags || []), "worked"]));
    return { reason: "rt.edge.strengthen", detail: { a: a.name, b: b.name, from: Number(old.toFixed(2)), to: Number(dataset.edges[idx].w.toFixed(2)) } };
  }
  dataset.edges.push({ a: a.id, b: b.id, w: 0.22 + rng() * 0.18, tags: ["community"] });
  return { reason: "rt.edge.new", detail: { a: a.name, b: b.name } };
}

module.exports = { makeDemoDataset, applyRandomEvent };

