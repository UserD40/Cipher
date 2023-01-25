import React, { useEffect, useState } from "react";
import swal from "sweetalert";

const Alert = ({ win, lost, timeLeft }) => {
  const [remainingTime, setRemainingTime] = useState(timeLeft);

  useEffect(() => {
    let intervalId;
    if (win) {
      intervalId = setInterval(() => {
        setRemainingTime(remainingTime - 1000);
        if (remainingTime <= 0) {
          clearInterval(intervalId);
        }
      }, 1000);
    } else if (lost) {
      setTimeout(() => {
        swal({
          title: "You ran out of lives. Better luck next time!",
          icon: "error",
          button: "OK"
        });
      }, 100);
    }
    return () => clearInterval(intervalId);
  }, [win, lost, remainingTime]);

  if (win) {
    const remainingTimeInSeconds = remainingTime / 1000;
    const hours = Math.floor(remainingTimeInSeconds / 3600);
    const minutes = Math.floor((remainingTimeInSeconds % 3600) / 60);
    const seconds = Math.floor(remainingTimeInSeconds % 60);

    return (
      <div>
        Come back in {hours} hours {minutes} minutes : {seconds} seconds to try again!
      </div>
    );
  } else {
    return null;
  }
};
export default Alert;