import { useMutation, useQuery } from "lakebed/client";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  type ActivityItem,
  type AllStats,
  type DifficultyStats,
  type GameView,
  type GuessRow,
  type Mark,
  type Preset,
  PEG_COLORS,
  decodeMarks,
  presetFor,
  scoreMarks,
} from "../shared/mastermind";

const GUESS_COOLDOWN_SECONDS = 5;
const HEARTBEAT_MS = 90_000;

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem("mm_sid");
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)).slice(0, 64);
      sessionStorage.setItem("mm_sid", id);
    }
    return id;
  } catch {
    return String(Math.random()).slice(2, 18);
  }
}

const CD = {
  bg: "#04080d",
  panel: "rgba(8,18,24,0.6)",
  rule: "#143040",
  text: "#e8f8ff",
  dim: "#5d8090",
  cyan: "#3df0ff",
  lime: "#a0ff5c",
  amber: "#ffc966",
  red: "#ff6c6c",
  green: "#3df0a8",
};
const MONO = '"JetBrains Mono", "SF Mono", "Courier New", monospace';

const EMPTY_STATS: DifficultyStats = {
  played: 0, won: 0, lost: 0, totalGuesses: 0, currentStreak: 0, bestStreak: 0, distribution: {},
};

// ─── Pegs & marks ───────────────────────────────────────────────────────────

function Peg({ color, size = 40, active = false, ghost = false, symbolMode = false, idx }:
  { color: number | null; size?: number; active?: boolean; ghost?: boolean; symbolMode?: boolean; idx?: number }) {
  if (color === null || color === undefined) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 6,
        background: ghost ? "linear-gradient(135deg, rgba(20,48,64,0.4), rgba(8,18,24,0.6))" : "rgba(8,18,24,0.3)",
        border: ghost ? `1px dashed ${CD.cyan}55` : `1px solid ${CD.rule}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {ghost && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: CD.dim, letterSpacing: "0.15em" }}>
            {idx != null ? String(idx + 1).padStart(2, "0") : "··"}
          </span>
        )}
      </div>
    );
  }
  const c = PEG_COLORS[color];
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: `linear-gradient(135deg, ${c.glow} 0%, ${c.hex} 70%)`,
      boxShadow: active
        ? `0 0 ${size * 0.4}px ${c.hex}aa, inset 0 0 ${size * 0.3}px ${c.hex}66, 0 0 0 1px ${c.glow}cc`
        : `0 0 ${size * 0.2}px ${c.hex}66, inset 0 0 8px rgba(0,0,0,0.3)`,
      position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
      color: "rgba(0,0,0,0.75)", fontSize: size * 0.4, fontWeight: 700, fontFamily: MONO,
    }}>
      {symbolMode ? c.symbol : null}
      <span style={{
        position: "absolute", top: 0, right: 0, width: 6, height: 6,
        borderRight: `1.5px solid ${c.glow}`, borderTop: `1.5px solid ${c.glow}`, opacity: 0.7,
      }} />
    </div>
  );
}

function CdMark({ mark, size = 12 }: { mark: Mark; size?: number }) {
  const styles = {
    exact: { bg: CD.green, label: "◉" },
    misplaced: { bg: CD.amber, label: "◐" },
    absent: { bg: "transparent", label: "○" },
  }[mark];
  if (mark === "absent") {
    return (
      <span style={{
        width: size + 2, height: size + 2, borderRadius: 2, border: `1px solid ${CD.rule}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: CD.dim, fontSize: size, fontFamily: MONO, background: "rgba(8,18,24,0.4)",
      }}>{styles.label}</span>
    );
  }
  return (
    <span style={{
      width: size + 2, height: size + 2, borderRadius: 2, background: `${styles.bg}22`,
      border: `1px solid ${styles.bg}`, boxShadow: `0 0 8px ${styles.bg}66`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: styles.bg, fontSize: size, fontFamily: MONO,
    }}>{styles.label}</span>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function CdHeader({ preset, attempts, status, online }:
  { preset: Preset; attempts: number; status: string | null; online: number }) {
  const statusColor = status === "won" ? CD.lime : status === "lost" ? CD.red : CD.cyan;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 14, borderBottom: `1px solid ${CD.rule}`, gap: 18, flexWrap: "wrap" }}>
      <div>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, letterSpacing: "0.35em", color: CD.dim, textTransform: "uppercase" }}>◆ encrypted signal · channel 0xA7</p>
        <h1 style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em", color: CD.text, textShadow: `0 0 24px ${CD.cyan}66` }}>
          mastermind<span style={{ color: CD.cyan, textShadow: `0 0 12px ${CD.cyan}`, animation: "cdblink 1.1s step-end infinite" }}>_</span>
        </h1>
        <p style={{ margin: "6px 0 0", fontFamily: MONO, fontSize: 11, color: CD.dim, letterSpacing: "0.04em" }}>
          <span style={{ color: CD.lime }}>$</span> decrypt --length={preset.codeLength} --alphabet={preset.numColors} --tries={preset.maxTries}{!preset.duplicates && " --unique"}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", color: CD.dim }}>STATUS</p>
        <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 12, color: statusColor, textShadow: `0 0 8px ${statusColor}` }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 6, background: statusColor, boxShadow: "0 0 8px currentColor", animation: status === "playing" ? "cdpulse 1.4s ease-in-out infinite" : "none" }} />
          {status === "playing" ? "DECRYPTING…" : status === "won" ? "CRACKED" : status === "lost" ? "LOCKED" : "STANDBY"}
        </p>
        <p style={{ margin: "6px 0 0", fontFamily: MONO, fontSize: 10, color: CD.dim, letterSpacing: "0.1em" }}>
          {online} subjects active · {attempts}/{preset.maxTries} tries
        </p>
      </div>
    </div>
  );
}

function CdDifficultyPicker({ difficulty, onChange }: { difficulty: string; onChange: (d: string) => void }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${CD.rule}`, borderRadius: 2, overflow: "hidden" }}>
      {DIFFICULTY_ORDER.map((k, i) => {
        const sel = difficulty === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)}
            title={DIFFICULTY_PRESETS[k].desc}
            style={{
              padding: "6px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em",
              background: sel ? `${CD.cyan}22` : "transparent", color: sel ? CD.cyan : CD.dim,
              border: 0, borderLeft: i > 0 ? `1px solid ${CD.rule}` : "none", cursor: "pointer",
              textShadow: sel ? `0 0 6px ${CD.cyan}` : "none",
            }}>{DIFFICULTY_PRESETS[k].label.toUpperCase()}</button>
        );
      })}
    </div>
  );
}

function SignalStrength({ guesses, codeLength }: { guesses: ParsedGuess[]; codeLength: number }) {
  let ex = 0, mi = 0;
  for (const g of guesses) for (const m of g.marks) { if (m === "exact") ex++; else if (m === "misplaced") mi++; }
  const info = guesses.length ? Math.min(100, Math.round(((ex + mi * 0.4) / (codeLength * guesses.length)) * 140)) : 0;
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", color: CD.dim }}>SIGNAL LOCK</p>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, color: CD.cyan, textShadow: `0 0 6px ${CD.cyan}` }}>{info}%</p>
      </div>
      <div style={{ display: "flex", gap: 2, height: 14 }}>
        {Array.from({ length: 24 }).map((_, i) => {
          const filled = (i / 24) * 100 < info;
          return <span key={i} style={{ flex: 1, background: filled ? `linear-gradient(180deg, ${CD.cyan}, ${CD.lime})` : "rgba(20,48,64,0.5)", borderRadius: 1, boxShadow: filled ? `0 0 6px ${CD.cyan}aa` : "none" }} />;
        })}
      </div>
    </div>
  );
}

function CdGuessLog({ idx, pegs, marks, codeLength, symbolMode, stamp }:
  { idx: number; pegs: number[]; marks: Mark[]; codeLength: number; symbolMode: boolean; stamp: string }) {
  const exact = marks.filter((m) => m === "exact").length;
  const misplaced = marks.filter((m) => m === "misplaced").length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 92px", gap: 14, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${CD.rule}` }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: CD.dim, letterSpacing: "0.05em" }}>
        <div style={{ color: CD.cyan }}>#{String(idx + 1).padStart(2, "0")}</div>
        <div>{stamp}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Array.from({ length: codeLength }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <Peg color={pegs[i]} size={32} symbolMode={symbolMode} />
            <CdMark mark={marks[i] ?? "absent"} size={10} />
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: CD.dim, textAlign: "right" }}>
        <div><span style={{ color: CD.green }}>{exact}</span> exact</div>
        <div><span style={{ color: CD.amber }}>{misplaced}</span> shifted</div>
      </div>
    </div>
  );
}

function CdDraft({ draft, codeLength, selectedSlot, setSelectedSlot, clearSlot, symbolMode }:
  { draft: (number | null)[]; codeLength: number; selectedSlot: number; setSelectedSlot: (i: number) => void; clearSlot: (i: number) => void; symbolMode: boolean }) {
  return (
    <div style={{ padding: 16, background: "linear-gradient(180deg, rgba(61,240,255,0.04), rgba(61,240,255,0.01))", border: `1px solid ${CD.cyan}44`, borderRadius: 4, boxShadow: "inset 0 0 30px rgba(61,240,255,0.05)", position: "relative" }}>
      {["tl", "tr", "bl", "br"].map((p) => (
        <span key={p} style={{
          position: "absolute", top: p[0] === "t" ? -1 : "auto", bottom: p[0] === "b" ? -1 : "auto",
          left: p[1] === "l" ? -1 : "auto", right: p[1] === "r" ? -1 : "auto", width: 14, height: 14,
          borderTop: p[0] === "t" ? `2px solid ${CD.cyan}` : "none", borderBottom: p[0] === "b" ? `2px solid ${CD.cyan}` : "none",
          borderLeft: p[1] === "l" ? `2px solid ${CD.cyan}` : "none", borderRight: p[1] === "r" ? `2px solid ${CD.cyan}` : "none",
        }} />
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: CD.cyan, textShadow: `0 0 6px ${CD.cyan}` }}>▸ COMPOSE BUFFER</p>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, color: CD.dim }}>[{draft.filter((c) => c != null).length}/{codeLength}]</p>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {Array.from({ length: codeLength }).map((_, i) => {
          const isSel = i === selectedSlot;
          return (
            <button key={i} type="button" onClick={() => setSelectedSlot(i)}
              onContextMenu={(e) => { e.preventDefault(); clearSlot(i); }}
              style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", position: "relative", outline: "none" }}>
              <Peg color={draft[i] ?? null} size={52} ghost active={isSel} idx={i} symbolMode={symbolMode} />
              {isSel && <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: CD.cyan, fontFamily: MONO, textShadow: `0 0 6px ${CD.cyan}` }}>▼</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CdColorBank({ numColors, onPick, draft, preset, symbolMode }:
  { numColors: number; onPick: (i: number) => void; draft: (number | null)[]; preset: Preset; symbolMode: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${numColors}, 1fr)`, gap: 8 }}>
      {Array.from({ length: numColors }).map((_, i) => {
        const used = !preset.duplicates && draft.includes(i);
        const c = PEG_COLORS[i];
        return (
          <button key={i} type="button" onClick={() => onPick(i)} disabled={used}
            style={{ background: "transparent", border: `1px solid ${CD.rule}`, borderRadius: 4, padding: "8px 4px 6px", cursor: used ? "not-allowed" : "pointer", opacity: used ? 0.25 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "border-color 0.12s, background 0.12s" }}
            onMouseEnter={(e) => { if (!used) { (e.currentTarget as HTMLElement).style.borderColor = c.glow; (e.currentTarget as HTMLElement).style.background = `${c.hex}11`; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = CD.rule; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            <Peg color={i} size={38} symbolMode={symbolMode} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: CD.dim, letterSpacing: "0.05em" }}>[{i + 1}]</span>
          </button>
        );
      })}
    </div>
  );
}

function CdButton({ children, onClick, disabled, primary }:
  { children: any; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  const c = primary ? CD.lime : CD.cyan;
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ padding: "10px 18px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", background: primary ? `${c}22` : "transparent", color: c, border: `1px solid ${c}`, boxShadow: disabled ? "none" : `0 0 12px ${c}44, inset 0 0 12px ${c}11`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.3 : 1, textShadow: `0 0 6px ${c}`, borderRadius: 2, transition: "background 0.12s" }}>
      {children}
    </button>
  );
}

// ─── Candidate space (client-side deduction helper) ──────────────────────────

type ParsedGuess = { pegs: number[]; marks: Mark[]; stamp: string };

function enumerateCodes(preset: Preset): number[][] {
  const { codeLength, numColors, duplicates } = preset;
  const out: number[][] = [];
  if (duplicates) {
    const total = Math.pow(numColors, codeLength);
    for (let i = 0; i < total; i++) {
      const code: number[] = [];
      let n = i;
      for (let p = 0; p < codeLength; p++) { code.push(n % numColors); n = Math.floor(n / numColors); }
      out.push(code);
    }
  } else {
    const pool = Array.from({ length: numColors }, (_, i) => i);
    const permute = (chosen: number[], remaining: number[]) => {
      if (chosen.length === codeLength) { out.push([...chosen]); return; }
      for (let i = 0; i < remaining.length; i++) {
        chosen.push(remaining[i]);
        permute(chosen, remaining.slice(0, i).concat(remaining.slice(i + 1)));
        chosen.pop();
      }
    };
    permute([], pool);
  }
  return out;
}

function marksEqual(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function estimateTotal(preset: Preset): number {
  if (preset.duplicates) return Math.pow(preset.numColors, preset.codeLength);
  let t = 1;
  for (let i = 0; i < preset.codeLength; i++) t *= preset.numColors - i;
  return t;
}
const ENUM_CAP = 400_000;

function usePossibilities(preset: Preset, guesses: ParsedGuess[]) {
  const [state, setState] = useState<{ count: number | null; total: number | null; flat: number[] | null; working: boolean; tooLarge: boolean }>({ count: null, total: null, flat: null, working: false, tooLarge: false });
  const key = useMemo(
    () => `${preset.codeLength}:${preset.numColors}:${preset.duplicates ? 1 : 0}:${guesses.map((g) => g.pegs.join("") + "|" + g.marks.join(",")).join(";")}`,
    [preset, guesses],
  );
  useEffect(() => {
    const est = estimateTotal(preset);
    if (est > ENUM_CAP) { setState({ count: null, total: est, flat: null, working: false, tooLarge: true }); return; }
    let cancelled = false;
    setState((s) => ({ ...s, working: true, tooLarge: false }));
    const t = setTimeout(() => {
      if (cancelled) return;
      const all = enumerateCodes(preset);
      const total = all.length;
      let kept = 0;
      const flat = Array(preset.numColors).fill(0);
      for (const code of all) {
        const cs = code.join("");
        let ok = true;
        for (const g of guesses) {
          if (!marksEqual(scoreMarks(cs, g.pegs.join("")), g.marks)) { ok = false; break; }
        }
        if (ok) { kept++; for (const p of code) flat[p]++; }
      }
      if (!cancelled) setState({ count: kept, total, flat, working: false, tooLarge: false });
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [key]);
  return state;
}

function CandidateSpace({ guesses, preset, online }: { guesses: ParsedGuess[]; preset: Preset; online: number }) {
  const { count, total, flat, working, tooLarge } = usePossibilities(preset, guesses);
  return (
    <div style={{ padding: 16, background: CD.panel, border: `1px solid ${CD.cyan}55`, borderRadius: 4, boxShadow: `inset 0 0 30px ${CD.cyan}08`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, height: 1, width: "100%", background: `linear-gradient(90deg, transparent, ${CD.cyan}, transparent)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.3em", color: CD.cyan, textShadow: `0 0 6px ${CD.cyan}` }}>◆ CANDIDATE SPACE</span>
          {working && <span style={{ fontFamily: MONO, fontSize: 9, color: CD.amber, animation: "cdpulse 1s linear infinite" }}>computing…</span>}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: CD.green, textShadow: `0 0 6px ${CD.green}`, whiteSpace: "nowrap" }} title="tabs viewing right now">
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: CD.green, boxShadow: "0 0 6px currentColor", marginRight: 6, animation: "cdpulse 1.6s ease-in-out infinite" }} />
          {online} online
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, color: count === 1 ? CD.lime : CD.text, textShadow: count === 1 ? `0 0 10px ${CD.lime}` : `0 0 8px ${CD.cyan}66`, lineHeight: 1 }}>
          {tooLarge ? "∞" : count == null ? "—" : count.toLocaleString()}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: CD.dim }}>/ {total == null ? "—" : total.toLocaleString()} codes</span>
      </div>
      <p style={{ margin: "4px 0 12px", fontFamily: MONO, fontSize: 10, color: CD.dim, letterSpacing: "0.04em" }}>
        {tooLarge ? "search space too large to enumerate"
          : count == null || total == null ? "awaiting first transmission"
          : count === 0 ? "!! inconsistent"
          : count === 1 ? "✓ unique solution — transmit to win"
          : `${((1 - count / total) * 100).toFixed(1)}% of search space pruned`}
      </p>
      {flat && count != null && count > 1 && (
        <div>
          <p style={{ margin: "0 0 6px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", color: CD.dim }}>COLOR LIKELIHOOD</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {flat.map((v, i) => {
              const max = Math.max(1, ...flat);
              const pct = (v / max) * 100;
              const expected = (count * preset.codeLength) / preset.numColors;
              const above = v > expected * 1.15;
              const below = v < expected * 0.85 && v > 0;
              const zero = v === 0;
              const col = zero ? CD.red : above ? CD.lime : below ? CD.amber : CD.cyan;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Peg color={i} size={18} />
                  <div style={{ flex: 1, height: 6, background: "rgba(20,48,64,0.5)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: col, boxShadow: zero ? "none" : `0 0 6px ${col}` }} />
                  </div>
                  <span style={{ width: 32, textAlign: "right", fontFamily: MONO, fontSize: 9, color: zero ? CD.red : above ? CD.lime : below ? CD.amber : CD.text }}>{zero ? "OUT" : v}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Telemetry / stats ────────────────────────────────────────────────────────

function CdStatRow({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: CD.dim }}>{label}</span>
      <span style={{ color: color || CD.text, textShadow: color ? `0 0 6px ${color}aa` : "none" }}>{value}</span>
    </div>
  );
}

function CdDist({ dist, maxTries }: { dist: Record<string, number>; maxTries: number }) {
  const max = Math.max(1, ...Object.values(dist));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {Array.from({ length: maxTries }).map((_, i) => {
        const k = i + 1;
        const v = dist[String(k)] || 0;
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 9 }}>
            <span style={{ width: 14, color: CD.dim, textAlign: "right" }}>{String(k).padStart(2, "0")}</span>
            <div style={{ flex: 1, height: 6, background: "rgba(20,48,64,0.5)", borderRadius: 1, overflow: "hidden" }}>
              <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: v ? CD.cyan : "transparent", boxShadow: v ? `0 0 6px ${CD.cyan}` : "none" }} />
            </div>
            <span style={{ width: 18, color: v ? CD.text : CD.dim, textAlign: "right" }}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function CdStats({ statsAll, activeDifficulty }: { statsAll: AllStats | null; activeDifficulty: string }) {
  const all = statsAll?.all ?? EMPTY_STATS;
  const winRate = all.played > 0 ? Math.round((all.won / all.played) * 100) : 0;
  const avg = all.won > 0 ? (all.totalGuesses / all.played).toFixed(2) : "—";
  // Distribution bars span at least the standard 10 tries, but stretch if any
  // legacy win used more — so no finished game is ever hidden off the chart.
  const distKeys = Object.keys(all.distribution).map(Number).filter((n) => Number.isFinite(n));
  const maxBar = Math.max(10, ...(distKeys.length ? distKeys : [0]));
  return (
    <div style={{ padding: 16, background: CD.panel, border: `1px solid ${CD.rule}`, borderRadius: 4 }}>
      <p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.3em", color: CD.cyan }}>◆ TELEMETRY · ALL SESSIONS</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", fontFamily: MONO, fontSize: 11 }}>
        <CdStatRow label="played" value={all.played} />
        <CdStatRow label="win.rate" value={`${winRate}%`} color={CD.lime} />
        <CdStatRow label="won" value={all.won} color={CD.green} />
        <CdStatRow label="lost" value={all.lost} color={CD.red} />
        <CdStatRow label="avg.tries" value={avg} />
        <CdStatRow label="streak" value={`${all.currentStreak}/${all.bestStreak}`} color={CD.amber} />
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${CD.rule}` }}>
        <p style={{ margin: "0 0 8px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", color: CD.dim }}>BY DIFFICULTY</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {DIFFICULTY_ORDER.map((d) => {
            const s = statsAll?.[d] ?? EMPTY_STATS;
            const rate = s.played > 0 ? Math.round((s.won / s.played) * 100) : 0;
            const active = d === activeDifficulty;
            return (
              <div key={d} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontFamily: MONO, fontSize: 10 }}>
                <span style={{ color: active ? CD.cyan : CD.dim, textShadow: active ? `0 0 6px ${CD.cyan}` : "none" }}>
                  {active ? "▸ " : "  "}{DIFFICULTY_PRESETS[d].label.toLowerCase()}
                </span>
                <span style={{ color: s.played ? CD.text : CD.dim }}>
                  {s.played} played · <span style={{ color: CD.green }}>{s.won}</span>w / <span style={{ color: CD.red }}>{s.lost}</span>l · {rate}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${CD.rule}` }}>
        <p style={{ margin: "0 0 6px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", color: CD.dim }}>CRACK DIST · ALL</p>
        <CdDist dist={all.distribution || {}} maxTries={maxBar} />
      </div>
    </div>
  );
}

function CdLiveFeed({ items }: { items: ActivityItem[] }) {
  const cap = (d: string) => (d ? d[0].toUpperCase() + d.slice(1) : d);
  const who = (h: string) => (h && h !== "local" ? h : "Someone");
  const hhmm = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "--:--" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const text = (it: ActivityItem) =>
    it.status === "won"
      ? `${who(it.handle)} solved ${cap(it.difficulty)} in ${it.guesses} ${it.guesses === 1 ? "guess" : "guesses"}`
      : `${who(it.handle)} ran out of guesses on ${cap(it.difficulty)}`;
  return (
    <div style={{ padding: 14, background: CD.panel, border: `1px solid ${CD.rule}`, borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, letterSpacing: "0.3em", color: CD.cyan }}>◆ RECENT GAMES</p>
        <span style={{ fontFamily: MONO, fontSize: 9, color: CD.dim }}>{items.length}</span>
      </div>
      <div className="mm-scroll" style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
        {items.length === 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: CD.dim, fontStyle: "italic" }}>No finished games yet — be the first.</span>}
        {items.map((it) => (
          <div key={it.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: MONO, fontSize: 10 }}>
            <span style={{ color: CD.dim }}>[{hhmm(it.at)}]</span>
            <span style={{ color: it.status === "won" ? CD.lime : CD.red }}>{it.status === "won" ? "✓" : "✕"}</span>
            <span style={{ color: CD.text }}>{text(it)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);
    const palette = [CD.cyan, CD.lime, CD.amber, "#ffffff"];
    const parts = Array.from({ length: 140 }).map((_, i) => ({
      x: w / 2 + (Math.random() - 0.5) * 80, y: h * 0.35,
      vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 7,
      g: 0.25 + Math.random() * 0.15, size: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: palette[i % palette.length], life: 0, maxLife: 120 + Math.random() * 60,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        p.life++;
        if (p.life > p.maxLife) continue;
        alive = true;
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive) rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);
  if (!active) return null;
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50 }} />;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const game = useQuery<GameView | null>("currentGame");
  const guessesRaw = useQuery<GuessRow[]>("guesses");
  const statsAll = useQuery<AllStats | null>("stats");
  const activity = useQuery<ActivityItem[]>("recentActivity");
  const onlineCount = useQuery<number>("onlineCount");
  const newGame = useMutation<[difficulty: string], void>("newGame");
  const submitGuess = useMutation<[guess: string], void>("submitGuess");
  const heartbeat = useMutation<[sessionId: string], void>("heartbeat");
  const sessionId = useRef(getSessionId());

  const [uiDifficulty, setUiDifficulty] = useState<string>(DEFAULT_DIFFICULTY);
  const [draft, setDraft] = useState<(number | null)[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [symbolMode, setSymbolMode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  const difficulty = uiDifficulty; // the player's selected tier (applies to the NEXT game)
  // The board follows the CURRENT game's own preset; only the start screen uses the selection.
  const preset = game?.preset ?? presetFor(difficulty);
  const status = game?.status ?? null;
  const playing = status === "playing";
  const pendingNext = !!game && game.difficulty !== uiDifficulty; // difficulty change queued for next game

  const guesses: ParsedGuess[] = useMemo(
    () => (guessesRaw ?? []).map((g) => {
      const ts = new Date(g.createdAt);
      const stamp = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
      return { pegs: g.guess.split("").map(Number), marks: decodeMarks(g.result), stamp };
    }),
    [guessesRaw],
  );
  const attempts = guesses.length;
  const activeDifficulty = game?.difficulty ?? uiDifficulty; // highlighted row in the per-difficulty breakdown
  const acts = activity ?? [];
  const online = Math.max(1, typeof onlineCount === "number" ? onlineCount : 1);

  // Inject a favicon + tab title at runtime (capsules have no HTML shell to edit).
  // A 2×2 peg grid in the brand palette, as an inline SVG data URI.
  useEffect(() => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#04080d"/>' +
      '<circle cx="11" cy="11" r="5" fill="#3df0ff"/>' +
      '<circle cx="21" cy="11" r="5" fill="#a0ff5c"/>' +
      '<circle cx="11" cy="21" r="5" fill="#ffc966"/>' +
      '<circle cx="21" cy="21" r="5" fill="#ff3a6e"/></svg>';
    document.querySelectorAll('link[rel~="icon"]').forEach((n) => n.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    document.head.appendChild(link);
    document.title = "mastermind";
  }, []);

  // Adopt the active game's difficulty as the selection when a NEW game loads.
  useEffect(() => { if (game?.difficulty) setUiDifficulty(game.difficulty); }, [game?.id]);

  // Reset local state whenever the active game changes.
  useEffect(() => {
    const p = game?.preset ?? presetFor(uiDifficulty);
    setDraft(Array(p.codeLength).fill(null));
    setSelectedSlot(0);
    setCooldown(0);
  }, [game?.id]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Tail the decrypt log to the newest entry whenever a guess is added.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [attempts]);

  // Presence heartbeat: ping while the tab is visible so others see us "online".
  // Paused when hidden to conserve the shared mutation budget.
  useEffect(() => {
    const sid = sessionId.current;
    const beat = () => { if (document.visibilityState === "visible") void heartbeat(sid); };
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const draftFull = draft.length === preset.codeLength && draft.every((c) => c != null);

  function placePeg(colorId: number, slot: number) {
    if (!playing || colorId >= preset.numColors) return;
    setDraft((d) => {
      const next = d.slice();
      while (next.length < preset.codeLength) next.push(null);
      if (!preset.duplicates && next.some((c, i) => c === colorId && i !== slot)) return d;
      next[slot] = colorId;
      return next.slice(0, preset.codeLength);
    });
    setSelectedSlot((s) => Math.min(preset.codeLength - 1, (slot ?? s) + 1));
  }
  function clearSlot(slot: number) {
    setDraft((d) => { const n = d.slice(); while (n.length <= slot) n.push(null); n[slot] = null; return n; });
    setSelectedSlot(slot);
  }
  function undoLast() {
    setDraft((d) => {
      const n = d.slice();
      for (let i = n.length - 1; i >= 0; i--) { if (n[i] != null) { n[i] = null; setSelectedSlot(i); return n; } }
      return n;
    });
  }
  async function submit() {
    if (!playing || !draftFull || cooldown > 0) return;
    await submitGuess(draft.join(""));
    setDraft(Array(preset.codeLength).fill(null));
    setSelectedSlot(0);
    setCooldown(GUESS_COOLDOWN_SECONDS);
  }
  async function startGame(d: string) {
    setUiDifficulty(d);
    setDraft(Array(presetFor(d).codeLength).fill(null));
    setSelectedSlot(0);
    setCooldown(0);
    await newGame(d);
  }
  function chooseDifficulty(d: string) {
    // Only sets what the NEXT game will be — never starts or resets a game, so it
    // can't disrupt the shared in-progress game. START NEW SESSION applies it.
    setUiDifficulty(d);
  }

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!playing) { if (e.key === "Enter" && game) { e.preventDefault(); void startGame(difficulty); } return; }
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (idx < preset.numColors) { e.preventDefault(); placePeg(idx, selectedSlot); }
      } else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); undoLast(); }
      else if (e.key === "Enter") { if (draftFull && cooldown === 0) { e.preventDefault(); void submit(); } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setSelectedSlot((s) => Math.max(0, s - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setSelectedSlot((s) => Math.min(preset.codeLength - 1, s + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, draftFull, cooldown, selectedSlot, preset.codeLength, preset.numColors, difficulty, game?.id, draft]);

  const secretPegs = game?.secret ? game.secret.split("").map(Number) : null;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: `linear-gradient(180deg, ${CD.bg} 0%, #02060a 100%)`, color: CD.text, fontFamily: MONO, overflow: "hidden", padding: 28 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes cdpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes cdscan { 0% { transform: translateY(-20%); } 100% { transform: translateY(120%); } }
        @keyframes cdblink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        .mm-grid { display: grid; grid-template-columns: minmax(0,1fr) 340px; gap: 28px; align-items: start; }
        @media (max-width: 940px) { .mm-grid { grid-template-columns: 1fr; } }
        .mm-scroll::-webkit-scrollbar { width: 6px; } .mm-scroll::-webkit-scrollbar-thumb { background: ${CD.rule}; border-radius: 3px; }
      `}</style>

      {/* grid overlay */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.4, backgroundImage: `linear-gradient(${CD.rule}80 1px, transparent 1px), linear-gradient(90deg, ${CD.rule}80 1px, transparent 1px)`, backgroundSize: "40px 40px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" }} />
      {/* scanline */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(180deg, transparent 0, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 3px)" }} />
      {/* scan beam */}
      <div style={{ position: "absolute", left: 0, right: 0, height: 120, background: `linear-gradient(180deg, transparent 0%, ${CD.cyan}11 50%, transparent 100%)`, animation: "cdscan 9s linear infinite", pointerEvents: "none", zIndex: 0, mixBlendMode: "screen" }} />

      <Confetti active={status === "won"} />

      <div className="mm-grid" style={{ position: "relative", zIndex: 1, maxWidth: 1500, margin: "0 auto" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <CdHeader preset={preset} attempts={attempts} status={status} online={online} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <CdDifficultyPicker difficulty={difficulty} onChange={chooseDifficulty} />
              {pendingNext && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: CD.amber, letterSpacing: "0.06em" }}>
                  ↻ {DIFFICULTY_PRESETS[uiDifficulty as keyof typeof DIFFICULTY_PRESETS]?.label} starts on your next session
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button type="button" onClick={() => setSymbolMode((v) => !v)}
                style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", padding: "5px 9px", borderRadius: 2, cursor: "pointer", background: symbolMode ? `${CD.cyan}22` : "transparent", color: symbolMode ? CD.cyan : CD.dim, border: `1px solid ${symbolMode ? CD.cyan : CD.rule}`, textShadow: symbolMode ? `0 0 6px ${CD.cyan}` : "none" }}>
                SYMBOLS {symbolMode ? "ON" : "OFF"}
              </button>
              <SignalStrength guesses={guesses} codeLength={preset.codeLength} />
            </div>
          </div>

          {status === "won" && (
            <div style={{ padding: "12px 18px", border: `1px solid ${CD.lime}`, background: `${CD.lime}11`, boxShadow: `0 0 18px ${CD.lime}33, inset 0 0 30px ${CD.lime}05`, borderRadius: 2, fontFamily: MONO, fontSize: 13, color: CD.lime, textShadow: `0 0 8px ${CD.lime}`, letterSpacing: "0.1em" }}>
              ✓ ENCRYPTION DEFEATED · {attempts} attempts · payload secured
            </div>
          )}
          {status === "lost" && secretPegs && (
            <div style={{ padding: "12px 18px", border: `1px solid ${CD.red}`, background: `${CD.red}11`, boxShadow: `0 0 18px ${CD.red}33`, borderRadius: 2, fontFamily: MONO, fontSize: 12, color: CD.red }}>
              <div style={{ textShadow: `0 0 8px ${CD.red}`, letterSpacing: "0.1em" }}>✕ CONNECTION TERMINATED · cipher remained:</div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {secretPegs.map((c, i) => <Peg key={i} color={c} size={32} symbolMode={symbolMode} />)}
              </div>
            </div>
          )}

          {/* Decrypt log */}
          <div ref={logRef} className="mm-scroll" style={{ maxHeight: 380, overflowY: "auto", padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, letterSpacing: "0.3em", color: CD.dim }}>◆ DECRYPT LOG</p>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, color: CD.dim }}>{attempts} ENTR{attempts === 1 ? "Y" : "IES"}</p>
            </div>
            {attempts === 0 && <p style={{ margin: "14px 0", fontFamily: MONO, fontSize: 11, color: CD.dim, fontStyle: "italic" }}>// no attempts logged · awaiting input</p>}
            {guesses.map((g, i) => (
              <CdGuessLog key={i} idx={i} pegs={g.pegs} marks={g.marks} codeLength={preset.codeLength} symbolMode={symbolMode} stamp={g.stamp} />
            ))}
          </div>

          {/* Input */}
          {playing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <CdDraft draft={draft} codeLength={preset.codeLength} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} clearSlot={clearSlot} symbolMode={symbolMode} />
              <CdColorBank numColors={preset.numColors} onPick={(c) => placePeg(c, selectedSlot)} draft={draft} preset={preset} symbolMode={symbolMode} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <CdButton onClick={undoLast} disabled={draft.every((c) => c == null)}>UNDO ⌫</CdButton>
                <div style={{ flex: 1 }} />
                <CdButton primary onClick={() => void submit()} disabled={!draftFull || cooldown > 0}>
                  {cooldown > 0 ? `WAIT ${cooldown}s` : "TRANSMIT ↵"}
                </CdButton>
              </div>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: 9, color: CD.dim, letterSpacing: "0.08em" }}>
                keys: [1–{preset.numColors}] place · ←→ move slot · ↵ transmit · ⌫ undo · right-click clears a slot
              </p>
            </div>
          ) : (
            <CdButton primary onClick={() => void startGame(difficulty)}>▶ START NEW SESSION</CdButton>
          )}
        </div>

        {/* Right rail */}
        <div className="mm-scroll" style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <CandidateSpace guesses={guesses} preset={preset} online={online} />
          <CdStats statsAll={statsAll} activeDifficulty={activeDifficulty} />
          <CdLiveFeed items={acts} />
        </div>
      </div>
    </div>
  );
}
