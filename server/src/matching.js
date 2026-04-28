function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function buildAdj(participants, edges) {
  const adj = new Map();
  for (const p of participants) adj.set(p.id, []);
  for (const e of edges) {
    if (!adj.has(e.a) || !adj.has(e.b)) continue;
    adj.get(e.a).push({ to: e.b, w: e.w, tags: e.tags || [] });
    adj.get(e.b).push({ to: e.a, w: e.w, tags: e.tags || [] });
  }
  return adj;
}

function edgeWeightBetween(a, b, adj) {
  const xs = adj.get(a) || [];
  const e = xs.find((x) => x.to === b);
  return e ? e.w : 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const ROLE_POOL = ["dev", "design", "data", "pm", "biz"];

function computeConstraint(participants, adj) {
  const N = new Map();
  for (const p of participants) N.set(p.id, (adj.get(p.id) || []).map((x) => x.to));
  const out = new Map();
  for (const p of participants) {
    const neigh = N.get(p.id) || [];
    if (neigh.length === 0) {
      out.set(p.id, 1);
      continue;
    }
    let sum = 0;
    for (const n of neigh) {
      const a = new Set(neigh);
      a.delete(n);
      const b = new Set(N.get(n) || []);
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      const denom = Math.max(1, a.size + b.size - inter);
      sum += inter / denom;
    }
    out.set(p.id, clamp01(sum / neigh.length));
  }
  return out;
}

function featureDistance(a, bProfile) {
  let d = 0;
  d += a.primaryRole === bProfile.role ? 0 : 0.25;
  d += a.city === bProfile.city ? 0 : 0.15;
  d += a.university === bProfile.university ? 0 : 0.18;
  d += a.community === bProfile.community ? 0 : 0.12;
  d += Math.abs(a.style?.divergence ?? 0.5 - (bProfile.style?.divergence ?? 0.5)) * 0.15;
  d += Math.abs(a.style?.structure ?? 0.5 - (bProfile.style?.structure ?? 0.5)) * 0.15;
  return clamp01(d);
}

function teamSkillVector(team, byId) {
  const v = { dev: 0, design: 0, data: 0, pm: 0, biz: 0 };
  for (const id of team.members) {
    const p = byId.get(id);
    const s = p.skills || {};
    for (const r of ROLE_POOL) v[r] += s[r] || 0;
  }
  return v;
}

function missingRolesScore(team, byId) {
  const v = teamSkillVector(team, byId);
  let miss = 0;
  if (v.dev <= 0) miss += 1.2;
  if (v.design <= 0) miss += 1.0;
  if (v.pm <= 0) miss += 0.8;
  if (v.data <= 0) miss += 0.35;
  if (v.biz <= 0) miss += 0.25;
  return miss;
}

function teamLevel(team, byId) {
  let s = 0;
  for (const id of team.members) s += byId.get(id).level || 0;
  return s;
}

function teamProfile(team, byId) {
  const counts = { role: new Map(), city: new Map(), university: new Map(), community: new Map() };
  let div = 0,
    st = 0;
  for (const id of team.members) {
    const p = byId.get(id);
    const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    bump(counts.role, p.primaryRole);
    bump(counts.city, p.city);
    bump(counts.university, p.university);
    bump(counts.community, p.community);
    div += p.style?.divergence ?? 0.5;
    st += p.style?.structure ?? 0.5;
  }
  const pickMax = (m) => {
    let best = null,
      bestV = -1;
    for (const [k, v] of m) if (v > bestV) (best = k), (bestV = v);
    return best;
  };
  const n = Math.max(1, team.members.length);
  return { role: pickMax(counts.role), city: pickMax(counts.city), university: pickMax(counts.university), community: pickMax(counts.community), style: { divergence: div / n, structure: st / n } };
}

function socialRisk(candidateId, team, adj) {
  let maxW = 0;
  for (const id of team.members) maxW = Math.max(maxW, edgeWeightBetween(candidateId, id, adj));
  if (maxW <= 0) return 1.0;
  if (maxW < 0.18) return 0.55;
  return 0.15;
}

function skillComplement(candidate, team, byId) {
  const v = teamSkillVector(team, byId);
  const deficits = {
    dev: v.dev < 5 ? 1 : 0,
    design: v.design < 3 ? 1 : 0,
    pm: v.pm < 3 ? 1 : 0,
    data: v.data < 2 ? 1 : 0,
    biz: v.biz < 2 ? 1 : 0,
  };
  let gain = 0;
  const s = candidate.skills || {};
  for (const r of ROLE_POOL) gain += deficits[r] * Math.min(1, (s[r] || 0) / 5);
  return clamp01(gain / 2.4);
}

function getStrategyParams(strategy) {
  if (strategy === "conservative") {
    return { strongEdge: 0.72, bridges: 1, wInter: 0.9, wDiversity: 0.6, wHole: 0.6, wComplement: 0.8, wRisk: 1.0, balanceIters: 220, chaos: 0.0 };
  }
  if (strategy === "chaotic") {
    return { strongEdge: 0.62, bridges: 2, wInter: 0.9, wDiversity: 0.75, wHole: 0.75, wComplement: 0.65, wRisk: 0.55, balanceIters: 120, chaos: 0.35 };
  }
  return { strongEdge: 0.68, bridges: 2, wInter: 1.1, wDiversity: 0.9, wHole: 0.9, wComplement: 0.9, wRisk: 0.75, balanceIters: 260, chaos: 0.12 };
}

function applyTuning(base, tuning) {
  const t = tuning || {};
  const stability = typeof t.stability === "number" ? t.stability : 0.5;
  const novelty = typeof t.novelty === "number" ? t.novelty : 0.7;
  const balance = typeof t.balance === "number" ? t.balance : 0.6;

  // stability ↑ => сильнее ядра, меньше риска "слишком чужой"
  const strongEdge = clamp01(base.strongEdge + (stability - 0.5) * 0.12);
  const wRisk = clamp01(base.wRisk + (stability - 0.5) * 0.55);

  // novelty ↑ => выше веса diversity/holes/inter + чуть больше chaos (в пределах)
  const wInter = base.wInter * (0.8 + novelty * 0.6);
  const wDiversity = base.wDiversity * (0.75 + novelty * 0.7);
  const wHole = base.wHole * (0.75 + novelty * 0.7);
  const chaos = clamp01(base.chaos + (novelty - 0.7) * 0.18);

  // balance ↑ => больше итераций улучшателя и сильнее комплементарность
  const balanceIters = Math.round(base.balanceIters * (0.6 + balance * 0.9));
  const wComplement = base.wComplement * (0.7 + balance * 0.8);

  const bridges = t.bridges == null ? base.bridges : t.bridges;

  return { ...base, strongEdge, wRisk, wInter, wDiversity, wHole, chaos, balanceIters, wComplement, bridges };
}

function pickTopWithChaos(scored, chaos, seed) {
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  if (chaos <= 0.0001) return scored[0];
  const rng = mulberry32(seed);
  const topN = Math.max(1, Math.min(scored.length, 1 + Math.floor(chaos * 8)));
  return scored[Math.floor(rng() * topN)];
}

function bridgeGain(candidate, team, byId, adj, constraintMap, params) {
  const prof = teamProfile(team, byId);
  const inter =
    (candidate.primaryRole === prof.role ? 0 : 0.35) + (candidate.city === prof.city ? 0 : 0.25) + (candidate.university === prof.university ? 0 : 0.25) + (candidate.community === prof.community ? 0 : 0.15);
  const diversity = featureDistance(candidate, prof);
  const hole = clamp01((1 - (constraintMap.get(candidate.id) ?? 1)) * 0.8 + ((adj.get(candidate.id) || []).length / 20) * 0.2);
  const complement = skillComplement(candidate, team, byId);
  const risk = socialRisk(candidate.id, team, adj);
  return params.wInter * clamp01(inter) + params.wDiversity * diversity + params.wHole * hole + params.wComplement * complement - params.wRisk * risk;
}

function findCores(participants, edges, adj, params) {
  const assigned = new Set();
  const strongPairs = edges.filter((e) => e.w >= params.strongEdge).sort((a, b) => b.w - a.w);

  const strongSet = new Set();
  for (const e of edges) if (e.w >= params.strongEdge) strongSet.add(e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`);
  const hasStrong = (a, b) => strongSet.has(a < b ? `${a}|${b}` : `${b}|${a}`);

  const neighStrong = new Map();
  for (const p of participants) neighStrong.set(p.id, (adj.get(p.id) || []).filter((x) => x.w >= params.strongEdge).map((x) => x.to));

  const triads = [];
  for (const p of participants) {
    const ns = neighStrong.get(p.id) || [];
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i],
          b = ns[j];
        if (!hasStrong(a, b)) continue;
        const score = edgeWeightBetween(p.id, a, adj) + edgeWeightBetween(p.id, b, adj) + edgeWeightBetween(a, b, adj);
        triads.push({ ids: [p.id, a, b], score });
      }
    }
  }
  triads.sort((x, y) => y.score - x.score);

  const cores = [];
  for (const t of triads) {
    if (t.ids.some((id) => assigned.has(id))) continue;
    if (t.score < params.strongEdge * 2.1) continue;
    const reasons = t.ids.map((id) => ({ id, text: "ядро: сильные связи (работали вместе)" }));
    cores.push({ members: [...t.ids], core: [...t.ids], bridges: [], reasons });
    t.ids.forEach((id) => assigned.add(id));
  }

  for (const e of strongPairs) {
    if (assigned.has(e.a) || assigned.has(e.b)) continue;
    cores.push({ members: [e.a, e.b], core: [e.a, e.b], bridges: [], reasons: [{ id: e.a, text: "ядро: сильная связь" }, { id: e.b, text: "ядро: сильная связь" }] });
    assigned.add(e.a);
    assigned.add(e.b);
  }

  return { cores, assigned };
}

function assignBridges(teams, participants, assigned, byId, adj, constraintMap, params) {
  for (const team of teams) {
    const localSeed = (team.core.join("").length * 1337) ^ (Math.floor(Math.random() * 1e9) >>> 0);
    for (let k = 0; k < params.bridges; k++) {
      const candidates = participants.filter((p) => !assigned.has(p.id));
      const scored = candidates.map((c) => ({ id: c.id, score: bridgeGain(c, team, byId, adj, constraintMap, params) }));
      const pickOne = pickTopWithChaos(scored, params.chaos, localSeed + k * 17);
      if (!pickOne) break;
      team.members.push(pickOne.id);
      team.bridges.push(pickOne.id);
      assigned.add(pickOne.id);
      const p = byId.get(pickOne.id);
      team.reasons.push({ id: pickOne.id, text: `bridge: ${p.primaryRole} из “${p.community}”, ${p.city}/${p.university}` });
    }
  }
}

function seedTeams(participants, edges, adj, params, teamSize) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const constraintMap = computeConstraint(participants, adj);
  const { cores, assigned } = findCores(participants, edges, adj, params);
  const teams = [...cores];

  const targetTeams = Math.max(1, Math.round(participants.length / Math.max(3, teamSize)));
  while (teams.length < targetTeams) {
    const free = participants.filter((p) => !assigned.has(p.id));
    if (free.length < 2) break;
    let best = null;
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i],
          b = free[j];
        const w = edgeWeightBetween(a.id, b.id, adj);
        const diff = featureDistance(a, { role: b.primaryRole, city: b.city, university: b.university, community: b.community, style: b.style });
        const comp = clamp01((a.skills?.dev === 0 && (b.skills?.dev || 0) > 0 ? 0.3 : 0) + (a.skills?.design === 0 && (b.skills?.design || 0) > 0 ? 0.25 : 0) + (a.skills?.pm === 0 && (b.skills?.pm || 0) > 0 ? 0.2 : 0));
        const score = w * 1.2 + diff * 0.35 + comp * 0.6 - Math.abs((a.level || 0) - (b.level || 0)) * 0.08;
        if (!best || score > best.score) best = { a: a.id, b: b.id, score };
      }
    }
    if (!best) break;
    teams.push({ members: [best.a, best.b], core: [best.a, best.b], bridges: [], reasons: [] });
    assigned.add(best.a);
    assigned.add(best.b);
  }

  assignBridges(teams, participants, assigned, byId, adj, constraintMap, params);
  return { teams, assigned, byId, constraintMap };
}

function assignRemainingByBalancing(teams, participants, assigned, byId, adj, teamSize) {
  const free = participants.filter((p) => !assigned.has(p.id));
  for (const p of free) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      if (t.members.length >= teamSize) continue;
      const lvl = teamLevel(t, byId);
      const miss = missingRolesScore(t, byId);
      let maxTie = 0;
      for (const id of t.members) maxTie = Math.max(maxTie, edgeWeightBetween(p.id, id, adj));
      const tie = maxTie > 0 ? Math.min(1, maxTie) : 0;
      const projected = { members: [...t.members, p.id] };
      const missAfter = missingRolesScore(projected, byId);
      const roleGain = clamp01((miss - missAfter) / 1.6);
      const score = -lvl * 0.18 + roleGain * 0.9 + tie * 0.25 - Math.abs((p.level || 0) - lvl / Math.max(1, t.members.length)) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      teams.push({ members: [p.id], core: [p.id], bridges: [], reasons: [] });
      assigned.add(p.id);
    } else {
      const before = missingRolesScore(teams[bestIdx], byId);
      teams[bestIdx].members.push(p.id);
      const after = missingRolesScore(teams[bestIdx], byId);
      const roleText = before > after ? `баланс: закрывает дефицит ролей (${p.primaryRole})` : `баланс: выравнивание уровня/покрытия (${p.primaryRole})`;
      teams[bestIdx].reasons.push({ id: p.id, text: roleText });
      assigned.add(p.id);
    }
  }
}

function localImproveSwaps(teams, byId, adj, iters, teamSize) {
  function penalty(t) {
    const miss = missingRolesScore(t, byId);
    let tieSum = 0,
      cnt = 0;
    for (let i = 0; i < t.members.length; i++) {
      for (let j = i + 1; j < t.members.length; j++) {
        cnt++;
        tieSum += edgeWeightBetween(t.members[i], t.members[j], adj);
      }
    }
    const cohesion = cnt ? tieSum / cnt : 0;
    const cohesionPenalty = cohesion < 0.12 ? (0.12 - cohesion) * 4 : 0;
    return miss * 1.1 + cohesionPenalty;
  }

  const rng = mulberry32((Date.now() >>> 0) ^ 0x9e3779b9);
  for (let k = 0; k < iters; k++) {
    if (teams.length < 2) break;
    const i = Math.floor(rng() * teams.length);
    let j = Math.floor(rng() * teams.length);
    if (j === i) j = (j + 1) % teams.length;
    const A = teams[i];
    const B = teams[j];
    if (A.members.length === 0 || B.members.length === 0) continue;
    const movableA = A.members.filter((id) => !(A.core.length >= 2 && A.core.includes(id)));
    const movableB = B.members.filter((id) => !(B.core.length >= 2 && B.core.includes(id)));
    if (movableA.length === 0 || movableB.length === 0) continue;
    const aId = movableA[Math.floor(rng() * movableA.length)];
    const bId = movableB[Math.floor(rng() * movableB.length)];
    const base = penalty(A) + penalty(B);
    const aIdx = A.members.indexOf(aId);
    const bIdx = B.members.indexOf(bId);
    A.members[aIdx] = bId;
    B.members[bIdx] = aId;
    A.bridges = A.bridges.filter((x) => x !== aId && x !== bId);
    B.bridges = B.bridges.filter((x) => x !== aId && x !== bId);
    const next = penalty(A) + penalty(B);
    const accept = next <= base || rng() < 0.08;
    if (!accept) {
      A.members[aIdx] = aId;
      B.members[bIdx] = bId;
    }
  }
}

function summarize(teams, byId, adj, constraintMap) {
  const teamNovelty = (t) => {
    const ids = t.members;
    if (ids.length < 2) return 0;
    let pairs = 0;
    let diverse = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs++;
        const a = byId.get(ids[i]);
        const b = byId.get(ids[j]);
        if (a.primaryRole !== b.primaryRole) diverse++;
        else if (a.city !== b.city || a.university !== b.university || a.community !== b.community) diverse += 0.5;
      }
    }
    const bridgeBonus = t.bridges.reduce((s, id) => s + (1 - (constraintMap.get(id) ?? 1)), 0) / Math.max(1, t.bridges.length);
    return clamp01((diverse / pairs) * 0.8 + bridgeBonus * 0.2);
  };

  const levels = teams.map((t) => teamLevel(t, byId));
  const mean = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  const variance = levels.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(1, levels.length);
  const std = Math.sqrt(variance);
  const noveltyAvg = teams.reduce((s, t) => s + teamNovelty(t), 0) / Math.max(1, teams.length);

  return { noveltyAvg, balanceStd: std };
}

function matchTeams({ participants, edges, teamSize, strategy }) {
  const adj = buildAdj(participants, edges);
  const params = getStrategyParams(strategy);
  const { teams, assigned, byId, constraintMap } = seedTeams(participants, edges, adj, params, teamSize);
  assignRemainingByBalancing(teams, participants, assigned, byId, adj, teamSize);
  localImproveSwaps(teams, byId, adj, params.balanceIters, teamSize);

  const flat = teams.filter((t) => t.members.length > 0);
  const metrics = summarize(flat, byId, adj, constraintMap);

  return {
    teams: flat.map((t, idx) => ({
      id: `team-${idx + 1}`,
      members: t.members,
      core: t.core,
      bridges: t.bridges,
      reasons: t.reasons,
    })),
    meta: { teamSize, strategy, params },
    metrics,
  };
}

function matchTeamsWithTuning({ participants, edges, teamSize, strategy, tuning }) {
  const adj = buildAdj(participants, edges);
  const base = getStrategyParams(strategy);
  const params = applyTuning(base, tuning);
  const { teams, assigned, byId, constraintMap } = seedTeams(participants, edges, adj, params, teamSize);
  assignRemainingByBalancing(teams, participants, assigned, byId, adj, teamSize);
  localImproveSwaps(teams, byId, adj, params.balanceIters, teamSize);
  const flat = teams.filter((t) => t.members.length > 0);
  const metrics = summarize(flat, byId, adj, constraintMap);
  return {
    teams: flat.map((t, idx) => ({
      id: `team-${idx + 1}`,
      members: t.members,
      core: t.core,
      bridges: t.bridges,
      reasons: t.reasons,
    })),
    meta: { teamSize, strategy, params, tuning: tuning || {} },
    metrics,
  };
}

module.exports = { matchTeams, matchTeamsWithTuning };

