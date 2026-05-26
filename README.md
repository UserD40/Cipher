# Mastermind

A code-breaking game with a **"Cyberdeck Terminal"** neon-HUD interface, built as a
[Lakebed](https://lakebed.dev) capsule. Crack a server-generated secret code; feedback
is **per position** — under each peg a mark shows exact (◉), shifted (◐), or absent (○).

## Features

- **Four difficulty modes** — Easy (5 pegs) → Normal (6) → Hard (7 unique) → Insane
  (8 unique), all 10 tries. Switching applies to your *next* game, never resetting the
  shared one in progress.
- **Candidate-space helper** — counts how many codes still match your guesses (client-side
  deduction; the secret never leaves the server).
- **Telemetry** — per-difficulty win rate, crack-distribution histogram, and streaks.
- **Live activity feed** — recent finished games across *all* players (a real server query).
- **Signal-lock meter**, colour-blind symbol mode, keyboard controls, confetti on win,
  and a 5-second cooldown between guesses.

## Why it's interesting

The secret code is generated and scored entirely **server-side** and is stored in the
capsule database. The `currentGame` query withholds the secret while a game is in
progress — it's only revealed once you win or run out of guesses — so it never reaches
the browser and can't be read from the client. Every guess is validated and scored on
the server. Each player (guest or Google-authenticated) gets their own game.

## Tech

- **Lakebed** capsule — full-stack TypeScript, server contract + Preact client.
- `server/index.ts` — `games` and `guesses` tables, `currentGame`/`guesses` queries,
  `newGame`/`submitGuess` mutations.
- `client/index.tsx` — Preact UI, Tailwind classes inline.
- `shared/mastermind.ts` — pure game logic (`scoreGuess`, validation, constants).

## Run locally

```sh
npx lakebed dev
```

Open http://localhost:3000. Add `?lakebed_guest=alice` to play as a named guest.

Inspect local state while `lakebed dev` is running:

```sh
npx lakebed db dump --port 3000    # see games (incl. secret) and guesses
npx lakebed logs --port 3000
```

## Deploy

Deploys anonymously (no claim needed) — the game is fully self-contained with no
outbound network calls:

```sh
npx lakebed deploy
```
