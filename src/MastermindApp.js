import React, { useState, useEffect } from "react";
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
  if (stored) return JSON.parse(stored);
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
  const [guesses, setGuesses] = useState([]);
  const [userChoices, setUserChoices] = useState([]);
  const [win, setWin] = useState(false);
  const [lost, setLost] = useState(false);
  const [lives, setLives] = useState(MAX_LIVES);
  const [timeLeft, setTimeLeft] = useState(getSecondsUntilMidnight);
  const [showInstructions, setShowInstructions] = useState(false);

  // Countdown timer — only runs while the game is still active
  useEffect(() => {
    if (win || lost) return;
    const intervalId = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [win, lost]);

  // Reset puzzle at midnight
  useEffect(() => {
    const msUntilMidnight = getMidnight() - new Date();
    const timerId = setTimeout(() => {
      const newCode = generateRandomCode();
      localStorage.setItem("winningCode", JSON.stringify(newCode));
      setWinningCode(newCode);
      setGuesses([]);
      setLives(MAX_LIVES);
      setWin(false);
      setLost(false);
      setTimeLeft(getSecondsUntilMidnight());
    }, msUntilMidnight);
    return () => clearTimeout(timerId);
  }, []);

  function checkGuess(guess) {
    const feedbackColors = Array(4).fill(null);
    const codeColorCounts = {};
    const guessColorCounts = {};

    // First pass: exact matches (green)
    for (let i = 0; i < 4; i++) {
      if (guess[i].color === winningCode[i].color) {
        feedbackColors[i] = "green";
      } else {
        codeColorCounts[winningCode[i].color] = (codeColorCounts[winningCode[i].color] || 0) + 1;
        guessColorCounts[guess[i].color] = (guessColorCounts[guess[i].color] || 0) + 1;
      }
    }

    // Second pass: wrong-position color matches (orange)
    const orangesAvailable = {};
    for (const color of Object.keys(guessColorCounts)) {
      orangesAvailable[color] = Math.min(
        guessColorCounts[color],
        codeColorCounts[color] || 0
      );
    }

    for (let i = 0; i < 4; i++) {
      if (feedbackColors[i] === null) {
        const color = guess[i].color;
        if (orangesAvailable[color] > 0) {
          feedbackColors[i] = "orange";
          orangesAvailable[color]--;
        } else {
          feedbackColors[i] = "";
        }
      }
    }

    // Sort: greens first, then oranges, then empties
    feedbackColors.sort((a, b) => {
      const order = { green: 0, orange: 1, "": 2 };
      return order[a] - order[b];
    });

    return feedbackColors;
  }

  function handleColorClick(color) {
    if (userChoices.length >= 4 || win || lost) return;
    setUserChoices([...userChoices, { color, position: userChoices.length, id: Date.now() }]);
  }

  function handleBack() {
    setUserChoices(userChoices.slice(0, -1));
  }

  function handleSubmit() {
    if (userChoices.length < 4 || win || lost) return;

    const guess = userChoices;
    const feedback = checkGuess(guess);
    setGuesses([...guesses, { guess, feedback }]);
    setUserChoices([]);

    if (feedback.every((f) => f === "green")) {
      setWin(true);
      swal({ title: "You cracked the code!", icon: "success", button: "OK" });
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      if (newLives === 0) {
        setLost(true);
        swal({
          title: "Out of guesses!",
          text: "Better luck tomorrow.",
          icon: "error",
          button: "OK",
        });
      }
    }
  }

  const gameOver = win || lost;

  return (
    <div className="app">
      <header className="game-header">
        <h1 className="game-title">Cipher</h1>
        <p className="game-subtitle">Daily Code-Breaking Puzzle</p>
        <button
          className="instructions-toggle"
          onClick={() => setShowInstructions(!showInstructions)}
        >
          {showInstructions ? "Hide Rules" : "How to Play"}
        </button>
      </header>

      {showInstructions && (
        <div className="instructions">
          <p>Guess the hidden 4-colour code in {MAX_LIVES} tries.</p>
          <p>
            <span className="green-text">✔ Green</span> — correct colour, correct position
          </p>
          <p>
            <span className="orange-text">❗ Orange</span> — correct colour, wrong position
          </p>
          <p>Colours can repeat. A new puzzle drops every day at midnight.</p>
        </div>
      )}

      {!gameOver && (
        <div className="lives-display">
          {Array.from({ length: MAX_LIVES }, (_, i) => (
            <span key={i} className={`life-dot ${i < lives ? "life-active" : "life-lost"}`} />
          ))}
          <span className="lives-text">
            {lives} guess{lives !== 1 ? "es" : ""} remaining
          </span>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Guess</th>
            <th>Feedback</th>
          </tr>
        </thead>
        <tbody>
          {guesses.map(({ guess, feedback }, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="guess-cell">
                {guess.map((color, j) => (
                  <div key={j} className={`color-circle ${color.color}`} />
                ))}
              </td>
              <td className="feedback-cell">
                {feedback.map((f, j) => (
                  <span key={j} className={`feedback-icon ${f}`}>
                    {f === "green" ? "✔" : f === "orange" ? "❗" : "·"}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!gameOver && (
        <>
          <div className="selected-colors-container">
            {userChoices.map((choice) => (
              <div key={choice.id} className={`color-circle ${choice.color}`} />
            ))}
            {Array.from({ length: 4 - userChoices.length }, (_, i) => (
              <div key={`empty-${i}`} className="color-circle color-empty" />
            ))}
          </div>

          <div className="color-selector">
            {COLORS.map((color) => (
              <button key={color} onClick={() => handleColorClick(color)} aria-label={color}>
                <div className={`color-circle ${color}`} />
              </button>
            ))}
          </div>

          <div className="guess-section">
            <button
              className="btn-one"
              onClick={handleBack}
              disabled={userChoices.length === 0}
            >
              <span>Back</span>
            </button>
            <button
              className="btn-one"
              onClick={handleSubmit}
              disabled={userChoices.length < 4}
            >
              <span>Submit</span>
            </button>
          </div>
        </>
      )}

      <Alert win={win} lost={lost} timeLeft={timeLeft} />
    </div>
  );
}
