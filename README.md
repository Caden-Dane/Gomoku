# Gomoku Multiplayer Game

This project implements a simple two‑player Gomoku variant that runs in a web browser.  Unlike traditional Gomoku (five‑in‑a‑row wins the game), here a player earns one point each time they connect five or more stones in a row, and then the board resets for the next round.  The first player to connect five in any direction (horizontal, vertical or diagonal) does **not** end the match; instead, their score increases by one, the board resets, and play continues.  Players can decide when to stop playing based on their score or mutual agreement.

## Features

* **Create or join games** via unique room codes.  The first player to create a game receives a six‑letter code that the second player can enter to join.
* **Real‑time play** over WebSockets using Socket.IO.  Moves, scores and turns update instantly for both players.
* **Score tracking** persists across rounds until players reset the scores.
* **Turn indicator** lets each player know when it’s their move.
* **Simple lobby system** for waiting on an opponent before the game starts.

## Project structure

```
gomoku/
├── package.json        # Node package configuration and dependencies
├── server.js           # Express/Socket.IO server
├── README.md           # Project documentation and setup instructions
└── public/             # Front‑end assets
    ├── index.html      # Main HTML page
    ├── styles.css      # Styling for the lobby and game
    └── script.js       # Client‑side logic and Socket.IO handling
```

## Running locally

This project includes a Python server (`server.py`) built with `aiohttp`, which serves the static files and manages real‑time communication via WebSockets.  No external package installation is required because `aiohttp` is already available in the execution environment.

1. **Start the server.**  In the project root, run:

   ```bash
   python3 server.py
   ```

   By default the server listens on port `3000`.  You can override this by setting the `PORT` environment variable before running the server:

   ```bash
   PORT=8080 python3 server.py
   ```

2. **Open the game in a browser.**  Navigate to `http://localhost:3000` (or whatever port you chose) in a modern browser.  You can open a second tab or another browser/device to create or join a game using the same server.

## Playing the game

* Enter your name in the lobby.
* **Create Game:** Click “Create New Game” to generate a room code.  Share this code with your opponent.  You’ll see a waiting screen until they join.
* **Join Game:** Enter the room code provided by your opponent and click “Join Game”.  Once connected, the game board will appear.
* **Taking turns:** The first player to create the room plays as **Black**; the second player plays as **White**.  The turn indicator shows whose move it is.
* **Scoring:** Each time a player forms a contiguous line of five or more stones, they earn one point.  The board resets automatically for the next round.  The scoring player takes the first turn in the new round.
* **Reset Scores:** At any time, either player can click “Reset Scores” to clear the scores and board.  This starts a fresh match while keeping both players in the room.
* **Quit:** The “Quit” button reloads the page and takes you back to the lobby.  If one player leaves, the remaining player stays in the room and can wait for a new opponent.

## Deploying for remote play

To allow players on different networks to connect, you must host the server on an accessible domain or IP address.  Here are a few options:

* **Host yourself:** Deploy the Node server (`server.js`) on a VPS or cloud provider (e.g., DigitalOcean, AWS EC2) with a public IP address.  Make sure to open the chosen port in your firewall.
* **Use a platform‑as‑a‑service:** Services like Heroku, Railway or Render can host Node applications with minimal configuration.  Push your code to a repository and follow their deployment instructions.  Ensure that WebSocket support is enabled.
* **Expose locally with tunneling:** For quick tests, you can use tunneling tools (like [ngrok](https://ngrok.com/)) to expose your local server to the internet.  Start the server locally then run `ngrok http 3000` to obtain a public URL to share with your opponent.

Note that GitHub Pages alone cannot host the real‑time server because it serves only static content.  You still need the Node server running somewhere reachable by both players.

## License

This project is provided under the MIT License.  You are free to modify and distribute it as you see fit.