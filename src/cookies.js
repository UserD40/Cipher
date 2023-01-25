import Cookies from 'js-cookie';

const cookieOptions = {
  expires: new Date(Date.now() + 86400 * 1000) // expires at 00:00 GMT
  };
  
  // Save the user's guesses, feedback, and lives remaining in cookies
  function saveToCookies(guesses, feedback, livesRemaining) {
  Cookies.set('guesses', guesses, cookieOptions);
  Cookies.set('feedback', feedback, cookieOptions);
  Cookies.set('livesRemaining', livesRemaining, cookieOptions);
  }
  
  // Use the saveToCookies and resetCookies functions in your code
  
  // When the user submits a guess
  handleSubmit();{
    // Save the user's guesses, feedback, and lives remaining in cookies
    saveToCookies(guesses, feedback, livesRemaining);
  }

  
  // When the winning code changes
  fetch('http://localhost:3000/winning-code')
  .then((response) => response.json())
  .then((data) => {
  setWinningCode(data);
  // Reset the user's guesses, feedback, and lives remaining in cookies
  resetCookies();
  });