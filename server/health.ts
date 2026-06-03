export interface HealthStatus {
  ok: boolean;
  version: string;
}

export function getHealth(): HealthStatus {
  return { ok: true, version: "scaffold" };
}
