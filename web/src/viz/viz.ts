import type { Dataset, MatchingResult, Participant, Role } from "../types";

type VizInput = { dataset: Dataset; result: MatchingResult; edgeTags?: string[] };

const ROLE_COLOR: Record<Role, string> = {
  dev: "#60a5fa",
  design: "#f472b6",
  data: "#34d399",
  pm: "#f59e0b",
  biz: "#a78bfa",
};

function edgeWeightBetween(a: string, b: string, edges: Dataset["edges"]) {
  for (const e of edges) {
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e.w;
  }
  return 0;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createViz(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;

  const state = {
    dataset: null as Dataset | null,
    result: null as MatchingResult | null,
    edgeTags: null as string[] | null,
    byId: new Map<string, Participant>(),
    nodes: [] as Array<{ id: string; x: number; y: number; vx: number; vy: number; teamIdx: number; isCore: boolean; isBridge: boolean }>,
    edges: [] as Array<{ aIdx: number; bIdx: number; w: number; kind: "in" | "out" }>,
    hover: null as number | null,
    focusTeamIdx: null as number | null,
  };

  function dpr() {
    return Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const s = dpr();
    canvas.width = Math.floor(r.width * s);
    canvas.height = Math.floor(r.height * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }

  function layout() {
    if (!state.dataset || !state.result) return;
    state.byId = new Map(state.dataset.participants.map((p) => [p.id, p]));

    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const teams = state.result.teams;

    const centers: Array<{ x: number; y: number }> = [];
    const R = Math.min(W, H) * 0.32;
    const cx = W * 0.56;
    const cy = H * 0.52;
    for (let i = 0; i < teams.length; i++) {
      const ang = (i / Math.max(1, teams.length)) * Math.PI * 2 - Math.PI / 2;
      centers.push({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R });
    }

    const nodes: typeof state.nodes = [];
    const idToIdx = new Map<string, number>();
    for (let tIdx = 0; tIdx < teams.length; tIdx++) {
      const t = teams[tIdx];
      const c = centers[tIdx];
      for (let m = 0; m < t.members.length; m++) {
        const id = t.members[m];
        const isCore = t.core.includes(id) && t.core.length > 1;
        const isBridge = t.bridges.includes(id);
        const angle = (m / Math.max(1, t.members.length)) * Math.PI * 2;
        const ring = isCore ? 26 : isBridge ? 74 : 48;
        const jitter = (Math.random() - 0.5) * 10;
        const x = c.x + Math.cos(angle) * (ring + jitter);
        const y = c.y + Math.sin(angle) * (ring + jitter);
        idToIdx.set(id, nodes.length);
        nodes.push({ id, x, y, vx: 0, vy: 0, teamIdx: tIdx, isCore, isBridge });
      }
    }

    const edges: typeof state.edges = [];
    // team internal edges
    for (let tIdx = 0; tIdx < teams.length; tIdx++) {
      const t = teams[tIdx];
      for (let i = 0; i < t.members.length; i++) {
        for (let j = i + 1; j < t.members.length; j++) {
          const w = edgeWeightBetweenFiltered(t.members[i], t.members[j]);
          if (w <= 0.12) continue;
          edges.push({ aIdx: idToIdx.get(t.members[i])!, bIdx: idToIdx.get(t.members[j])!, w, kind: "in" });
        }
      }
    }
    // cross-team strong edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.teamIdx === b.teamIdx) continue;
        const w = edgeWeightBetweenFiltered(a.id, b.id);
        if (w < 0.22) continue;
        edges.push({ aIdx: i, bIdx: j, w, kind: "out" });
      }
    }

    state.nodes = nodes;
    state.edges = edges;
  }

  function edgeWeightBetweenFiltered(a: string, b: string) {
    if (!state.dataset) return 0;
    const tags = state.edgeTags;
    if (!tags || tags.length === 0) return edgeWeightBetween(a, b, state.dataset.edges);
    for (const e of state.dataset.edges) {
      if (!((e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
      const et = e.tags || [];
      if (et.some((t) => tags.includes(t))) return e.w;
    }
    return 0;
  }

  function tickPhysics() {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    for (const n of state.nodes) {
      n.vx *= 0.92;
      n.vy *= 0.92;
    }

    for (const e of state.edges) {
      const a = state.nodes[e.aIdx];
      const b = state.nodes[e.bIdx];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(0.0001, Math.hypot(dx, dy));
      const target = e.kind === "in" ? 52 - e.w * 18 : 170 - e.w * 40;
      const k = e.kind === "in" ? 0.0022 : 0.0012;
      const f = (dist - target) * k;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (let i = 0; i < state.nodes.length; i++) {
      for (let j = i + 1; j < state.nodes.length; j++) {
        const a = state.nodes[i];
        const b = state.nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy;
        const min = a.teamIdx === b.teamIdx ? 18 * 18 : 13 * 13;
        if (dist2 < min) {
          const dist = Math.max(0.0001, Math.sqrt(dist2));
          const push = (min - dist2) * 0.00004;
          const fx = (dx / dist) * push;
          const fy = (dy / dist) * push;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    for (const n of state.nodes) {
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(14, Math.min(W - 14, n.x));
      n.y = Math.max(14, Math.min(H - 14, n.y));
    }
  }

  function hitTest(mx: number, my: number) {
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      const dx = mx - n.x;
      const dy = my - n.y;
      const d = Math.hypot(dx, dy);
      const r = n.isBridge ? 10 : n.isCore ? 10 : 9;
      if (d <= r && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);

    // background stars
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 140; i++) {
      const x = (((i * 97) % 1000) / 1000) * W;
      const y = (((i * 179) % 1000) / 1000) * H;
      const a = 0.04 + (((i * 31) % 100) / 100) * 0.1;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    for (const e of state.edges) {
      const a = state.nodes[e.aIdx];
      const b = state.nodes[e.bIdx];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const alpha = e.kind === "in" ? 0.12 + e.w * 0.22 : 0.05 + e.w * 0.12;
      const dim = state.focusTeamIdx != null && a.teamIdx !== state.focusTeamIdx && b.teamIdx !== state.focusTeamIdx ? 0.35 : 1;
      ctx.strokeStyle =
        e.kind === "in"
          ? `rgba(255,255,255,${alpha * dim})`
          : `rgba(139,92,246,${alpha * dim})`;
      ctx.lineWidth = e.kind === "in" ? 1.2 : 1.0;
      ctx.stroke();
    }

    const css = getComputedStyle(document.documentElement);
    const coreColor = (css.getPropertyValue("--core") || "#60a5fa").trim();
    const bridgeColor = (css.getPropertyValue("--bridge") || "#f472b6").trim();

    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      const p = state.byId.get(n.id);
      if (!p) continue;
      const base = ROLE_COLOR[p.primaryRole] || "rgba(255,255,255,0.8)";
      const r = n.isCore ? 7.2 : n.isBridge ? 7.8 : 6.0;
      const glow = n.isCore ? 0.48 : n.isBridge ? 0.42 : 0.18;
      const dim = state.focusTeamIdx != null && n.teamIdx !== state.focusTeamIdx ? 0.22 : 1;

      ctx.save();
      ctx.globalAlpha = glow * dim;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = base;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.isCore ? coreColor : n.isBridge ? bridgeColor : base;
      ctx.globalAlpha = dim;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (state.hover === i) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    if (state.hover != null) {
      const n = state.nodes[state.hover];
      const p = state.byId.get(n.id);
      if (!p) return;
      const lines = [
        `${p.name}`,
        `${p.primaryRole}${p.secondaryRole ? " / " + p.secondaryRole : ""} • level ${p.level}`,
        `${p.city} • ${p.university} • ${p.community}`,
        `${n.isCore ? "ядро" : n.isBridge ? "bridge" : "участник"} • Team ${n.teamIdx + 1}`,
      ];

      ctx.save();
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const padX = 10;
      const padY = 8;
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + padX * 2;
      const h = lines.length * 16 + padY * 2;
      let x = n.x + 14;
      let y = n.y - h - 12;
      if (x + w > W - 10) x = n.x - w - 14;
      if (y < 10) y = n.y + 12;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x + padX, y + padY + 12 + i * 16);
      }
      ctx.restore();
    }
  }

  function animate() {
    tickPhysics();
    draw();
    requestAnimationFrame(animate);
  }

  canvas.addEventListener("mousemove", (ev) => {
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    state.hover = hitTest(mx, my);
  });
  canvas.addEventListener("mouseleave", () => (state.hover = null));

  window.addEventListener("resize", () => {
    resize();
    layout();
  });

  resize();
  animate();

  return {
    setData(input: VizInput) {
      state.dataset = input.dataset;
      state.result = input.result;
      state.edgeTags = input.edgeTags || null;
      layout();
    },
    focusTeam(teamIdx: number | null) {
      state.focusTeamIdx = teamIdx;
    },
  };
}

