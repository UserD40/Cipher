import React, { useState, useEffect } from "react";
import swal from "sweetalert";
import Alert from "./Alert";
import "./styles.css";

const colors = ["red", "blue", "green", "yellow", "purple"];

export default function MastermindApp() {
  const [winningCode, setWinningCode] = useState(generateRandomCode());
  const [guesses, setGuesses] = useState([]);
  const [userChoices, setUserChoices] = useState([]);
  const [remainingColors] = useState(colors);
  const [win, setWin] = useState(false);
  const [lives, setLives] = useState(1);
  const [lost, setLost] = useState(false);
  const formatTime = (time) => {
    time = time / 1000;
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = time % 60;
    return `${hours < 10 ? "0" + hours : hours}:${
      minutes < 10 ? "0" + minutes : minutes
    }:${seconds < 10 ? "0" + seconds : seconds}`;
  };
  let now = new Date();
  let nextUpdate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const initialTimeLeft = (nextUpdate - now)/1000;
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);
  
  useEffect(() => {
    let intervalId;
    if (win === false && lives > 0) {
        intervalId = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1000);
        }, 1000);
    } else {
        clearInterval(intervalId);
    }
    return () => clearInterval(intervalId);
}, [win, lives]);
console.log(timeLeft)

  useEffect(() => {
    if (lives === 0) {
      swal({
        title: "You've ran out of lives. Better luck next time!",
        text: `Time left: ${formatTime(timeLeft)}`,
        icon: "error",
        button: "OK",
      });
      setLost(true);
    }
  }, [lives, timeLeft]);
  

  useEffect(() => {
    if (!localStorage.getItem("winningCode")) {
      localStorage.setItem("winningCode", JSON.stringify(generateRandomCode()));
    }
    setWinningCode(JSON.parse(localStorage.getItem("winningCode")));
    let now = new Date();
    let nextUpdate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );
    if (nextUpdate < now) {
      nextUpdate.setDate(nextUpdate.getDate() + 1);
    }
    setTimeout(() => {
      localStorage.setItem("winningCode", JSON.stringify(generateRandomCode()));
      setWinningCode(JSON.parse(localStorage.getItem("winningCode")));
      setTimeout(() => {}, nextUpdate - now);
    }, nextUpdate - now);
  }, []);

  function generateRandomCode() {
    let randomCode = [];
    for (let i = 0; i < 4; i++) {
      let randomIndex = Math.floor(Math.random() * colors.length);
      randomCode.push({
        color: colors[randomIndex],
        position: i,
        id: Date.now() + i,
      });
    }
    return randomCode;
  }

  function handleBack() {
    const newChoices = userChoices.slice(0, -1);
    setUserChoices(newChoices);
  }

  function handleColorClick(color) {
    setUserChoices([
      ...userChoices,
      { color, position: userChoices.length + 1, id: Date.now() },
    ]);
  }

  function checkGuess(guess, winningCode) {
    let feedbackColors = Array.from({ length: 4 }, () => null);
    let matchedColors = {};
    let correctGuess = true;
    for (let i = 0; i < winningCode.length; i++) {
      if (winningCode[i].color === guess[i].color) {
        feedbackColors[i] = "green";
        matchedColors[winningCode[i].color] = matchedColors[
          winningCode[i].color
        ]
          ? matchedColors[winningCode[i].color] + 1
          : 1;
      } else {
        correctGuess = false;
      }
    }
    if (correctGuess) {
      setWin(true);
      swal({
        title: "Congratulations! You've won!",
        icon: "success",
        button: "OK",
      });
    } else {
      setLives((prevLives) => prevLives - 1);
    }
    setGuesses([...guesses, { guess, feedbackColors }]);
    for (let i = 0; i < winningCode.length; i++) {
      if (!feedbackColors[i]) {
        if (
          winningCode.map((c) => c.color).includes(guess[i].color) &&
          !matchedColors[guess[i].color]
        ) {
          feedbackColors[i] = "orange";
          matchedColors[guess[i].color] = matchedColors[guess[i].color]
            ? matchedColors[guess[i].color] + 1
            : 1;
        } else {
          feedbackColors[i] = "";
        }
      }
    }
    feedbackColors.sort((a, b) => {
      if (a === "green") return -1;
      if (b === "green") return 1;
      return 0;
    });
    return feedbackColors;
  }

  function handleSubmit() {
    let guess = userChoices;
    let feedback = checkGuess(guess, winningCode);
    setGuesses([...guesses, { guess, feedback }]);
    setUserChoices([]);

    if (feedback.every((color) => color === "green")) {
      setWin(true);
      setTimeout(() => {
        setWin(false);
      }, timeLeft);
    } else {
      setLives(lives - 1);
      if (lives === 0) {
        setLost(true);
        setTimeout(() => {
          setLost(false);
        }, 3000);
      }
    }
  }

  return (
    <div className="app">
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Attempt</th>
            <th style={{ textAlign: "center" }}>Guess</th>
            <th style={{ textAlign: "right", paddingRight: "20px" }}>
              Feedback
            </th>
          </tr>
        </thead>
        <tbody>
          {guesses.map((guess, i) => (
            <tr key={`guess-${i}`}>
              <td>{i + 1}</td>
              <td>
                {guess.guess.map((color, i) => (
                  <div
                    key={`guessColor-${i}`}
                    className={`color-circle ${color.color}`}
                  />
                ))}
              </td>
              <td>
                {guess.feedback.map((feedback, i) => (
                  <div key={i} className={`feedback ${feedback}`}>
                    {feedback === "green"
                      ? "✔"
                      : feedback === "orange"
                      ? "❗"
                      : ""}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lives > 0 ? (
        <>
          <div className="selected-colors-container">
            {userChoices.map((choice, index) => (
              <div key={choice.id} className={`color-circle ${choice.color}`} />
            ))}
          </div>

          <div className="guess-section">
            <button className="btn-one" onClick={handleBack}>
              Back
            </button>
            <button className="btn-one" onClick={handleSubmit}>
              Submit
            </button>
          </div>
          {userChoices.length < 4 ? (
            <div className={`color-selector`}>
              {remainingColors.map((color, i) => (
                <button key={color} onClick={() => handleColorClick(color)}>
                  <div key={i} className={`color-circle ${color}`} />
                </button>
              ))}
            </div>
          ) : null}
          <br />
          <br />
        </>
      ) : null}

      <Alert win={win} lost={lost} timeLeft={timeLeft} setWin={setWin} />
    </div>
  );
}
