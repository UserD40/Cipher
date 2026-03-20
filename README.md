# Cipher

A daily Mastermind-style code-breaking puzzle built with React. One puzzle per day — crack the hidden 4-colour code before your guesses run out.

## How It Works

A random sequence of 4 colours is generated each day and stored locally. You have **10 attempts** to guess it. After each guess you receive colour-coded feedback:

| Symbol | Meaning |
|--------|---------|
| ✔ Green | Correct colour, correct position |
| ❗ Orange | Correct colour, wrong position |
| · | Colour not in the code |

Colours can repeat. A new puzzle is generated automatically at midnight.

## Features

- Daily puzzle that resets at midnight (persisted via `localStorage`)
- Accurate feedback algorithm handling duplicate colours correctly
- 10-guess limit displayed as a live dot tracker
- Toggleable rules panel for new players
- Empty slot placeholders so you always know how many colours you've picked
- Disabled controls and clean game-over state
- Countdown timer to the next puzzle on win or loss

## Tech Stack

- **React 18** — hooks-based state management (`useState`, `useEffect`)
- **SweetAlert** — win/loss notifications
- **Custom CSS** — no UI framework; dark gradient theme with CSS animations

## Getting Started

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── MastermindApp.js   # Game logic and UI
├── Alert.js           # Post-game countdown display
├── styles.css         # All styling
└── index.js           # React entry point
```

## Build for Production

```bash
npm run build
```

Outputs an optimised static bundle to `/build`, ready to deploy on any static host (Netlify, Vercel, GitHub Pages, etc.).
