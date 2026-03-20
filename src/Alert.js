import React from "react";

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const Alert = ({ win, lost, timeLeft }) => {
  if (!win && !lost) return null;

  return (
    <div className="end-message">
      {win ? (
        <>
          <p className="end-title win-title">You cracked the code!</p>
          <p className="end-subtitle">
            Next puzzle in: <strong>{formatTime(timeLeft)}</strong>
          </p>
        </>
      ) : (
        <>
          <p className="end-title loss-title">Out of guesses!</p>
          <p className="end-subtitle">
            Next puzzle in: <strong>{formatTime(timeLeft)}</strong>
          </p>
        </>
      )}
    </div>
  );
};

export default Alert;
