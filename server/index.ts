import { capsule, mutation, query, string, table } from "lakebed/server";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  type DifficultyStats,
  encodeMarks,
  generateSecret,
  isSolved,
  isValidGuess,
  presetFor,
  scoreMarks,
} from "../shared/mastermind";

function emptyStats(): DifficultyStats {
  return { played: 0, won: 0, lost: 0, totalGuesses: 0, currentStreak: 0, bestStreak: 0, distribution: {} };
}

// Effective preset for a stored game: difficulty defines colors/tries/dups, but
// codeLength comes from the actual secret so changing a preset definition never
// breaks a game already in progress.
function gamePreset(game: { secret: string; difficulty: string }) {
  return { ...presetFor(game.difficulty), codeLength: game.secret.length };
}

export default capsule({
  name: "mastermind",

  schema: {
    games: table({
      ownerId: string(),
      secret: string(), // server-only; never returned while playing
      status: string(), // "playing" | "won" | "lost"
      difficulty: string(), // "easy" | "normal" | "hard" | "insane"
    }),
    guesses: table({
      gameId: string(),
      ownerId: string(),
      guess: string(),
      result: string(), // one mark per position: "e"=exact, "m"=misplaced, "a"=absent
    }),
    presence: table({
      sessionId: string(), // per-tab id
      at: string(), // last-seen epoch ms (as string)
    }),
  },

  queries: {
    currentGame: query((ctx) => {
      const game = ctx.db.games
        .where("ownerId", ctx.auth.userId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .all()[0];

      if (!game) return null;

      const finished = game.status !== "playing";
      return {
        id: game.id,
        status: game.status,
        difficulty: game.difficulty || DEFAULT_DIFFICULTY,
        preset: gamePreset(game),
        secret: finished ? game.secret : null,
        createdAt: game.createdAt,
      };
    }),

    guesses: query((ctx) => {
      const game = ctx.db.games
        .where("ownerId", ctx.auth.userId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .all()[0];

      if (!game) return [];

      return ctx.db.guesses
        .where("gameId", game.id)
        .orderBy("createdAt", "asc")
        .all();
    }),

    // Per-difficulty lifetime stats: wins/losses, win distribution, streaks.
    stats: query((ctx) => {
      const games = ctx.db.games
        .where("ownerId", ctx.auth.userId)
        .orderBy("createdAt", "asc")
        .all();
      const guesses = ctx.db.guesses.where("ownerId", ctx.auth.userId).all();

      const counts: Record<string, number> = {};
      for (const g of guesses) counts[g.gameId] = (counts[g.gameId] ?? 0) + 1;

      const out: Record<string, DifficultyStats> = {};
      for (const d of DIFFICULTY_ORDER) out[d] = emptyStats();
      const all = emptyStats(); // combined aggregate; streak is chronological across every difficulty

      for (const game of games) {
        if (game.status === "playing") continue;
        const d = game.difficulty in DIFFICULTY_PRESETS ? game.difficulty : DEFAULT_DIFFICULTY;
        const n = counts[game.id] ?? 0;
        // Update the per-difficulty bucket and the combined "all" bucket together.
        for (const s of [out[d], all]) {
          s.played++;
          s.totalGuesses += n;
          if (game.status === "won") {
            s.won++;
            s.distribution[String(n)] = (s.distribution[String(n)] ?? 0) + 1;
            s.currentStreak++;
            if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
          } else {
            s.lost++;
            s.currentStreak = 0;
          }
        }
      }

      return { ...out, all };
    }),

    // Recent finished games across ALL players — powers the live activity feed.
    // Query won/lost directly and merge: abandoned "playing" games can never
    // crowd finished ones out (the old limit-then-filter approach dropped real
    // games from the feed once enough unfinished games piled up).
    recentActivity: query((ctx) => {
      const won = ctx.db.games.where("status", "won").orderBy("updatedAt", "desc").limit(50).all();
      const lost = ctx.db.games.where("status", "lost").orderBy("updatedAt", "desc").limit(50).all();
      const games = [...won, ...lost]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
        .slice(0, 50);

      const guesses = ctx.db.guesses.all();
      const counts: Record<string, number> = {};
      for (const g of guesses) counts[g.gameId] = (counts[g.gameId] ?? 0) + 1;

      return games.map((game) => ({
        id: game.id,
        handle: game.ownerId.replace(/^guest:/, ""),
        status: game.status,
        guesses: counts[game.id] ?? 0,
        difficulty: game.difficulty || DEFAULT_DIFFICULTY,
        at: game.updatedAt,
      }));
    }),

    // Number of tabs seen within the presence window — "people on the page now".
    onlineCount: query((ctx) => {
      const now = Date.now();
      const ONLINE_MS = 210_000; // 3.5 min (heartbeat is ~90s; tolerate a missed beat)
      let n = 0;
      for (const p of ctx.db.presence.all()) {
        if (now - Number(p.at) < ONLINE_MS) n++;
      }
      return n;
    }),
  },

  mutations: {
    // Start a fresh game at the chosen difficulty with a server-generated secret.
    newGame: mutation((ctx, difficulty: string) => {
      const diff = difficulty in DIFFICULTY_PRESETS ? difficulty : DEFAULT_DIFFICULTY;
      const preset = presetFor(diff);
      ctx.db.games.insert({
        ownerId: ctx.auth.userId,
        secret: generateSecret(preset),
        status: "playing",
        difficulty: diff,
      });
    }),

    // Submit a guess against the player's active game. Scored server-side so
    // the secret never reaches the client.
    submitGuess: mutation((ctx, guess: string) => {
      const game = ctx.db.games
        .where("ownerId", ctx.auth.userId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .all()[0];

      if (!game || game.status !== "playing") return;

      const preset = gamePreset(game);
      if (!isValidGuess(guess, preset)) return;

      const prior = ctx.db.guesses.where("gameId", game.id).all();
      if (prior.length >= preset.maxTries) return;

      const marks = scoreMarks(game.secret, guess);
      ctx.db.guesses.insert({
        gameId: game.id,
        ownerId: ctx.auth.userId,
        guess,
        result: encodeMarks(marks),
      });

      if (isSolved(marks)) {
        ctx.db.games.update(game.id, { status: "won" });
      } else if (prior.length + 1 >= preset.maxTries) {
        ctx.db.games.update(game.id, { status: "lost" });
      }
    }),

    // Mark this tab as present (upsert) and prune long-stale rows. One mutation
    // per heartbeat — clients should call this sparingly (~90s, visible only).
    heartbeat: mutation((ctx, sessionId: string) => {
      if (!sessionId || sessionId.length > 64) return;
      const now = Date.now();
      const existing = ctx.db.presence.where("sessionId", sessionId).limit(1).all()[0];
      if (existing) ctx.db.presence.update(existing.id, { at: String(now) });
      else ctx.db.presence.insert({ sessionId, at: String(now) });

      // Prune rows older than 10 minutes to keep the table bounded.
      for (const p of ctx.db.presence.all()) {
        if (now - Number(p.at) > 600_000) ctx.db.presence.delete(p.id);
      }
    }),
  },
});
