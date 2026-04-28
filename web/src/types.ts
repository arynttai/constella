export type Strategy = "conservative" | "experimental" | "chaotic";

export type Role = "dev" | "design" | "data" | "pm" | "biz";

export type Participant = {
  id: string;
  name: string;
  primaryRole: Role;
  secondaryRole: Role | null;
  city: string;
  university: string;
  community: string;
  style: { divergence: number; structure: number };
  skills: Record<Role, number>;
  level: number;
};

export type Edge = { a: string; b: string; w: number; tags: string[] };

export type Dataset = { seed?: number; participants: Participant[]; edges: Edge[] };

export type Team = {
  id: string;
  members: string[];
  core: string[];
  bridges: string[];
  reasons: { id: string; text: string }[];
};

export type MatchingResult = {
  teams: Team[];
  meta: { teamSize: number; strategy: Strategy; params: unknown };
  metrics: { noveltyAvg: number; balanceStd: number };
};

export type TeamsCurrentResponse = {
  ok: true;
  dataset: Dataset;
  result: MatchingResult;
  config: { teamSize: number; strategy: Strategy; tuning?: { stability?: number; novelty?: number; balance?: number; bridges?: number | null } };
};

export type MatchingConfigResponse = {
  ok: true;
  config: { teamSize: number; strategy: Strategy; tuning?: { stability?: number; novelty?: number; balance?: number; bridges?: number | null } };
};

export type WsMessage =
  | { type: "hello"; payload: any; ts: number }
  | { type: "graph.updated"; payload: any; ts: number }
  | { type: "teams.updated"; payload: any; ts: number };

