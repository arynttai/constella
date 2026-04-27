import type { MatchingConfigResponse, Strategy, TeamsCurrentResponse } from "../types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function apiGetTeamsCurrent(): Promise<TeamsCurrentResponse> {
  return await j<TeamsCurrentResponse>(await fetch("/api/teams/current"));
}

export async function apiPostDemoRegen(): Promise<{ ok: true }> {
  return await j<{ ok: true }>(await fetch("/api/dataset/demo", { method: "POST" }));
}

export async function apiPostMatchingConfig(input: {
  teamSize: number;
  strategy: Strategy;
  tuning?: { stability?: number; novelty?: number; balance?: number; bridges?: number | null };
}): Promise<MatchingConfigResponse> {
  return await j<MatchingConfigResponse>(
    await fetch("/api/matching/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function apiGetParticipants(): Promise<{ ok: true; participants: any[]; excluded: string[] }> {
  return await j(await fetch("/api/participants"));
}

export async function apiPutParticipant(id: string, patch: any): Promise<{ ok: true; participant: any }> {
  return await j(
    await fetch(`/api/participants/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

export async function apiPostExclude(id: string, on: boolean): Promise<{ ok: true; constraints: any }> {
  return await j(
    await fetch("/api/constraints/exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, on }),
    })
  );
}

export async function apiPostImportCsv(input: { participantsCsv?: string; edgesCsv?: string; mode?: "replace" | "merge" }): Promise<{ ok: true; dataset: any }> {
  return await j(
    await fetch("/api/import/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

