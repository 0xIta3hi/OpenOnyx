export interface FTUXState {
  notesCount: number;
  acceptedConnections: number;
  acceptedSuggestions: number;
  insightShown: boolean;
  graphPromptShown: boolean;
  trajectoryActivated: boolean;
}

export type FTUXStage =
  | "zero"
  | "first_note"
  | "connection"
  | "insight"
  | "graph"
  | "trajectory";

const FTUX_STORAGE_KEY = "openobsidian-ftux";
const FTUX_NOT_NOW_KEY = "openobsidian-ftux-not-now-until";

const DEFAULT_FTUX_STATE: FTUXState = {
  notesCount: 0,
  acceptedConnections: 0,
  acceptedSuggestions: 0,
  insightShown: false,
  graphPromptShown: false,
  trajectoryActivated: false,
};

export function loadFTUXState(): FTUXState {
  try {
    const raw = localStorage.getItem(FTUX_STORAGE_KEY);
    if (!raw) return DEFAULT_FTUX_STATE;
    const parsed = JSON.parse(raw) as Partial<FTUXState>;
    return {
      ...DEFAULT_FTUX_STATE,
      ...parsed,
      notesCount: Number.isFinite(parsed.notesCount)
        ? Math.max(0, parsed.notesCount || 0)
        : 0,
      acceptedConnections: Number.isFinite(parsed.acceptedConnections)
        ? Math.max(0, parsed.acceptedConnections || 0)
        : 0,
      acceptedSuggestions: Number.isFinite(parsed.acceptedSuggestions)
        ? Math.max(0, parsed.acceptedSuggestions || 0)
        : 0,
    };
  } catch {
    return DEFAULT_FTUX_STATE;
  }
}

export function saveFTUXState(state: FTUXState): void {
  localStorage.setItem(FTUX_STORAGE_KEY, JSON.stringify(state));
}

export function loadFTUXNotNowSuppression(): number {
  try {
    const raw = localStorage.getItem(FTUX_NOT_NOW_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  } catch {
    return 0;
  }
}

export function saveFTUXNotNowSuppression(value: number): void {
  localStorage.setItem(FTUX_NOT_NOW_KEY, String(Math.max(0, Math.floor(value))));
}

export function getFTUXStage(state: FTUXState): FTUXStage {
  if (state.notesCount <= 0) return "zero";
  if (state.notesCount === 1) return "first_note";
  if (!state.insightShown && state.notesCount >= 4) return "insight";
  if (!state.graphPromptShown && state.notesCount >= 5 && state.acceptedConnections >= 1) {
    return "graph";
  }
  if (state.acceptedSuggestions >= 2 || state.trajectoryActivated) {
    return "trajectory";
  }
  return "connection";
}
