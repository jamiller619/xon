import type { ScanProgress, ScanSummary } from "./orchestrator.js";

export type ScanState = {
  status: "running" | "completed" | "failed";
  startedAt: Date;
  progress: ScanProgress | null;
  summary: ScanSummary | null;
  error: string | null;
};

/**
 * Shared singleton registry of scan states keyed by libraryId.
 * Shared between the scan router and the admin health endpoint.
 */
export const scanRegistry = new Map<string, ScanState>();
