// Pure game logic shared by server and client.
// No DOM, Node, env, or Lakebed runtime imports allowed here.

// ─── Difficulty presets ────────────────────────────────────────────────────

export type Difficulty = "easy" | "normal" | "hard" | "insane";

export type Preset = {
  label: string;
  codeLength: number;
  numColors: number;
  maxTries: number;
  duplicates: boolean;
  desc: string;
};

// All tiers allow duplicate colours (classic Mastermind): the secret is no longer
// a permutation of the whole palette, so which colours are even in play is unknown.
// Hard/Insane search spaces exceed the client ENUM_CAP, so the candidate-space
// auto-solver intentionally goes dark on those tiers — no countdown to the answer.
export const DIFFICULTY_PRESETS: Record<Difficulty, Preset> = {
  easy: { label: "Easy", codeLength: 5, numColors: 6, maxTries: 10, duplicates: true, desc: "5 pegs · 6 colors · 10 tries" },
  normal: { label: "Normal", codeLength: 6, numColors: 7, maxTries: 9, duplicates: true, desc: "6 pegs · 7 colors · 9 tries" },
  hard: { label: "Hard", codeLength: 7, numColors: 8, maxTries: 9, duplicates: true, desc: "7 pegs · 8 colors · 9 tries" },
  insane: { label: "Insane", codeLength: 8, numColors: 8, maxTries: 8, duplicates: true, desc: "8 pegs · 8 colors · 8 tries" },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard", "insane"];
export const DEFAULT_DIFFICULTY: Difficulty = "normal";

export function presetFor(difficulty: string): Preset {
  return DIFFICULTY_PRESETS[difficulty as Difficulty] ?? DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY];
}

// ─── Refined "luxe" peg palette (index = symbol stored in a code string) ────

export const PEG_COLORS = [
  { name: "Crimson", hex: "#ff3a6e", glow: "#ff5c89", symbol: "◆" },
  { name: "Amber", hex: "#ff9a3c", glow: "#ffb86b", symbol: "▲" },
  { name: "Citron", hex: "#f0d24a", glow: "#fde26b", symbol: "●" },
  { name: "Jade", hex: "#2fd6a3", glow: "#5cf0c4", symbol: "■" },
  { name: "Azure", hex: "#4aa8ff", glow: "#7cc2ff", symbol: "★" },
  { name: "Violet", hex: "#b46bff", glow: "#cf94ff", symbol: "✦" },
  { name: "Coral", hex: "#ff6f5c", glow: "#ff8f7c", symbol: "◇" },
  { name: "Cyan", hex: "#22d3ff", glow: "#6fe3ff", symbol: "△" },
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export type GameStatus = "playing" | "won" | "lost";
export type Mark = "exact" | "misplaced" | "absent";

export type GuessRow = {
  id: string;
  gameId: string;
  ownerId: string;
  guess: string;
  result: string;
  createdAt: string;
  updatedAt: string;
};

export type GameView = {
  id: string;
  status: GameStatus;
  difficulty: string;
  preset: Preset; // the effective preset for THIS game (codeLength derived from the secret)
  secret: string | null; // revealed only when finished
  createdAt: string;
};

export type DifficultyStats = {
  played: number;
  won: number;
  lost: number;
  totalGuesses: number;
  currentStreak: number;
  bestStreak: number;
  distribution: Record<string, number>; // guesses-to-win -> count
};

// Per-difficulty buckets plus a combined "all" aggregate across every difficulty.
export type AllStats = Record<Difficulty, DifficultyStats> & { all: DifficultyStats };

export type ActivityItem = {
  id: string;
  handle: string;
  status: GameStatus;
  guesses: number;
  difficulty: string;
  at: string; // ISO finish time (game.updatedAt)
};

// ─── Validation & secret generation ─────────────────────────────────────────

export function isValidGuess(guess: string, preset: Preset): boolean {
  if (guess.length !== preset.codeLength) return false;
  const seen = new Set<string>();
  for (const ch of guess) {
    const n = Number(ch);
    if (!Number.isInteger(n) || n < 0 || n >= preset.numColors) return false;
    if (!preset.duplicates) {
      if (seen.has(ch)) return false;
      seen.add(ch);
    }
  }
  return true;
}

export function generateSecret(preset: Preset): string {
  const { codeLength, numColors, duplicates } = preset;
  if (duplicates) {
    let out = "";
    for (let i = 0; i < codeLength; i++) out += Math.floor(Math.random() * numColors).toString();
    return out;
  }
  // Fisher-Yates over the color pool, take the first codeLength as unique digits.
  const pool = Array.from({ length: numColors }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, codeLength).join("");
}

// ─── Per-position scoring (Wordle-style) with duplicate handling ────────────

export function scoreMarks(secret: string, guess: string): Mark[] {
  const marks: Mark[] = guess.split("").map(() => "absent");
  const left: Record<string, number> = {};
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) marks[i] = "exact";
    else left[secret[i]] = (left[secret[i]] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === "exact") continue;
    const c = guess[i];
    if ((left[c] ?? 0) > 0) {
      marks[i] = "misplaced";
      left[c]--;
    }
  }
  return marks;
}

const MARK_CODE: Record<Mark, string> = { exact: "e", misplaced: "m", absent: "a" };

export function encodeMarks(marks: Mark[]): string {
  return marks.map((m) => MARK_CODE[m]).join("");
}

export function decodeMarks(result: string | undefined | null): Mark[] {
  if (!result) return [];
  return result
    .split("")
    .map((ch) => (ch === "e" ? "exact" : ch === "m" ? "misplaced" : "absent"));
}

export function isSolved(marks: Mark[]): boolean {
  return marks.length > 0 && marks.every((m) => m === "exact");
}
