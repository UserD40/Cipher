import React from "react";

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const Alert = ({ win, lost, timeLeft, winningCode, onPlayAgain }) => {
  if (!win && !lost) return null;

  return (
    <div className="end-message">
      {win ? (
        <>
          <p className="end-title win-title">Code Cracked!</p>
          <p className="end-subtitle">
            Next puzzle in <strong>{formatTime(timeLeft)}</strong>
          </p>
        </>
      ) : (
        <>
          <p className="end-title loss-title">Out of guesses!</p>
          {winningCode && (
            <div className="answer-reveal">
              <p className="end-subtitle">The code was:</p>
              <div className="answer-pegs">
                {winningCode.map((c, i) => (
                  <div key={i} className={`peg peg-lg ${c.color}`} />
                ))}
              </div>
            </div>
          )}
          <p className="end-subtitle">
            Next puzzle in <strong>{formatTime(timeLeft)}</strong>
          </p>
        </>
      )}
      <button className="play-again-btn" onClick={onPlayAgain}>
        Play Again
      </button>
    </div>
  );
};

export default Alert;
