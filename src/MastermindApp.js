import React, { useState, useEffect, useRef } from "react";
import swal from "sweetalert";
import Alert from "./Alert";
import "./styles.css";

const COLORS = ["red", "blue", "green", "yellow", "purple"];
const MAX_LIVES = 10;

function generateRandomCode() {
  return Array.from({ length: 4 }, (_, i) => ({
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    position: i,
  }));
}

function getOrGenerateCode() {
  const stored = localStorage.getItem("winningCode");
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length === 4 && parsed[0]?.color) {
      return parsed;
    }
  }
  const code = generateRandomCode();
  localStorage.setItem("winningCode", JSON.stringify(code));
  return code;
}

function getMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
}

function getSecondsUntilMidnight() {
  return Math.floor((getMidnight() - new Date()) / 1000);
}

export default function MastermindApp() {
  const [winningCode, setWinningCode] = useState(() => getOrGenerateCode());
  const winningCodeRef = useRef(winningCode);

  const [guesses, setGuesses] = useState([]);
  const [userChoices, setUserChoices] = useState([]);
  const [win, setWin] = useState(false);
  const [lost, setLost] = useState(false);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(getSecondsUntilMidnight);
  const [showInstructions, setShowInstructions] = useState(false);

  // Keep ref in sync so checkGuess never reads stale state
  useEffect(() => {
    winningCodeRef.current = winningCode;
  }, [winningCode]);

  // Countdown — only while game is active
  useEffect(() => {
    if (win || lost) return;
    const id = setInterval(() => setTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [win, lost]);

  // Reset at midnight
  useEffect(() => {
    const ms = getMidnight() - new Date();
    const id = setTimeout(() => {
      const newCode = generateRandomCode();
      localStorage.setItem("winningCode", JSON.stringify(newCode));
      setWinningCode(newCode);
      setGuesses([]);
      setLives(MAX_LIVES);
      setWin(false);
      setLost(false);
      setTimeLeft(getSecondsUntilMidnight());
    }, ms);
    return () => clearTimeout(id);
  }, []);

  // Positional feedback — no sorting
  function checkGuess(guess) {
    const code = winningCodeRef.current;
    const feedback = Array(4).fill(null);
    const codeColorCounts = {};
    const guessColorCounts = {};

    // First pass: exact matches (green)
    for (let i = 0; i < 4; i++) {
      if (guess[i].color === code[i].color) {
        feedback[i] = "green";
      } else {
        codeColorCounts[code[i].color] = (codeColorCounts[code[i].color] || 0) + 1;
        guessColorCounts[guess[i].color] = (guessColorCounts[guess[i].color] || 0) + 1;
      }
    }

    // Second pass: wrong-position matches (orange)
    const orangesLeft = {};
    for (const color of Object.keys(guessColorCounts)) {
      orangesLeft[color] = Math.min(guessColorCounts[color], codeColorCounts[color] || 0);
    }

    for (let i = 0; i < 4; i++) {
      if (feedback[i] === null) {
        const color = guess[i].color;
        if (orangesLeft[color] > 0) {
          feedback[i] = "orange";
          orangesLeft[color]--;
        } else {
          feedback[i] = "miss";
        }
      }
    }

    return feedback;
  }

  function handleColorClick(color) {
    if (userChoices.length >= 4 || win || lost) return;
    setUserChoices((prev) => [
      ...prev,
      { color, position: prev.length, id: Date.now() },
    ]);
  }

  function handleBack() {
    setUserChoices((prev) => prev.slice(0, -1));
  }

  function handleSubmit() {
    if (userChoices.length < 4 || win || lost) return;

    const guess = userChoices;
    const feedback = checkGuess(guess);
    setGuesses((prev) => [...prev, { guess, feedback }]);
    setUserChoices([]);

    if (feedback.every((f) => f === "green")) {
      setWin(true);
      swal({ title: "You cracked the code!", icon: "success", button: "OK" });
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives === 0) {
        setLost(true);
        swal({ title: "Out of guesses!", text: "Better luck tomorrow.", icon: "error", button: "OK" });
      }
    }
  }

  function handlePlayAgain() {
    const newCode = generateRandomCode();
    localStorage.setItem("winningCode", JSON.stringify(newCode));
    setWinningCode(newCode);
    setGuesses([]);
    setUserChoices([]);
    setLives(MAX_LIVES);
    setWin(false);
    setLost(false);
    setTimeLeft(getSecondsUntilMidnight());
  }

  const gameOver = win || lost;

  return (
    <div className="app">
      <header className="game-header">
        <div className="title-row">
          <h1 className="game-title">CIPHER</h1>
          <button
            className="help-btn"
            onClick={() => setShowInstructions((v) => !v)}
            aria-label="How to play"
          >
            ?
          </button>
        </div>
        <p className="game-subtitle">Daily Code-Breaking Puzzle</p>
      </header>

      {showInstructions && (
        <div className="instructions">
          <p>Guess the hidden 4-colour code in <strong>{MAX_LIVES}</strong> attempts.</p>
          <div className="legend">
            <div className="legend-item">
              <div className="peg peg-sm fb-green" />
              <span>Right colour, right position</span>
            </div>
            <div className="legend-item">
              <div className="peg peg-sm fb-orange" />
              <span>Right colour, wrong position</span>
            </div>
            <div className="legend-item">
              <div className="peg peg-sm fb-miss" />
              <span>Not in the code</span>
            </div>
          </div>
          <p className="instructions-note">Colours can repeat. New puzzle every day at midnight.</p>
        </div>
      )}

      {!gameOver && (
        <div className="lives-row">
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <span
              key={i}
              className={`life-pip ${i < lives ? "life-on" : "life-off"}`}
            />
          ))}
          <span className="lives-label">{lives} left</span>
        </div>
      )}

      <div className="game-board">
        {guesses.map(({ guess, feedback }, i) => (
          <div key={i} className="guess-row">
            <span className="row-num">{i + 1}</span>
            <div className="guess-pegs">
              {guess.map((c, j) => (
                <div key={j} className={`peg peg-lg ${c.color}`} />
              ))}
            </div>
            <div className="feedback-grid">
              {feedback.map((f, j) => (
                <div
                  key={j}
                  className={`peg peg-sm ${
                    f === "green" ? "fb-green" : f === "orange" ? "fb-orange" : "fb-miss"
                  }`}
                />
              ))}
            </div>
          </div>
        ))}

        {!gameOver && (
          <div className="guess-row guess-row-active">
            <span className="row-num">{guesses.length + 1}</span>
            <div className="guess-pegs">
              {Array(4)
                .fill(null)
                .map((_, i) => (
                  <div
                    key={i}
                    className={`peg peg-lg ${
                      userChoices[i] ? userChoices[i].color : "peg-empty"
                    }`}
                  />
                ))}
            </div>
            <div className="feedback-grid">
              {Array(4)
                .fill(null)
                .map((_, i) => (
                  <div key={i} className="peg peg-sm fb-miss" />
                ))}
            </div>
          </div>
        )}
      </div>

      {!gameOver && (
        <div className="controls-area">
          <div className="color-picker">
            {COLORS.map((color) => (
              <button
                key={color}
                className={`picker-btn ${color}`}
                onClick={() => handleColorClick(color)}
                aria-label={color}
              />
            ))}
          </div>
          <div className="action-buttons">
            <button
              className="btn-action"
              onClick={handleBack}
              disabled={userChoices.length === 0}
            >
              ← Back
            </button>
            <button
              className="btn-action btn-submit"
              onClick={handleSubmit}
              disabled={userChoices.length < 4}
            >
              Submit
            </button>
          </div>
        </div>
      )}

      <Alert win={win} lost={lost} timeLeft={timeLeft} winningCode={winningCode} onPlayAgain={handlePlayAgain} />
    </div>
  );
}
