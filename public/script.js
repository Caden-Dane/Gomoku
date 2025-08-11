/*
 * Client-side logic for the Gomoku multiplayer game using native WebSockets.
 * This script connects to the server, handles user interactions in the lobby
 * and game views, and updates the DOM in response to server messages.
 */

(() => {
  // DOM element references
  const lobbyView = document.getElementById('lobby');
  const waitingView = document.getElementById('waiting');
  const gameView = document.getElementById('game');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const resetBtn = document.getElementById('resetBtn');
  const quitBtn = document.getElementById('quitBtn');
  const nameInput = document.getElementById('nameInput');
  const gameIdInput = document.getElementById('gameIdInput');
  const roomCodeElem = document.getElementById('roomCode');
  const playerInfoElem = document.getElementById('playerInfo');
  const scoreBoardElem = document.getElementById('scoreBoard');
  const turnIndicatorElem = document.getElementById('turnIndicator');
  const boardContainer = document.getElementById('boardContainer');
  const messagesElem = document.getElementById('messages');

  // Game state variables
  let socket; // WebSocket connection
  let myId = null;
  let currentRoom = null;
  let players = [];
  let names = {};
  let scores = {};
  let currentTurn = 0;
  let myIndex = null;
  let board = [];
  const BOARD_SIZE = 15;

  /**
   * Switch view among lobby, waiting, and game views.
   * @param {HTMLElement} view The view element to show
   */
  function showView(view) {
    [lobbyView, waitingView, gameView].forEach((v) => {
      v.style.display = v === view ? 'block' : 'none';
    });
  }

  /**
   * Display a message in the messages area
   * @param {string} msg
   */
  function showMessage(msg) {
    messagesElem.textContent = msg;
  }

  /**
   * Clear any displayed message
   */
  function clearMessage() {
    messagesElem.textContent = '';
  }

  /**
   * Build the empty game board in the DOM
   */
  function buildBoard() {
    boardContainer.innerHTML = '';
    for (let row = 0; row < BOARD_SIZE; row++) {
      const rowDiv = document.createElement('div');
      rowDiv.classList.add('row');
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cellDiv = document.createElement('div');
        cellDiv.classList.add('cell');
        cellDiv.dataset.row = row;
        cellDiv.dataset.col = col;
        cellDiv.addEventListener('click', handleCellClick);
        rowDiv.appendChild(cellDiv);
      }
      boardContainer.appendChild(rowDiv);
    }
  }

  /**
   * Render the board state by placing stones in their respective cells
   */
  function renderBoard() {
    const rows = boardContainer.children;
    for (let r = 0; r < BOARD_SIZE; r++) {
      const rowDiv = rows[r];
      const cells = rowDiv.children;
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = cells[c];
        // Clear previous content
        cell.innerHTML = '';
        const val = board[r][c];
        if (val === 1 || val === 2) {
          const stone = document.createElement('div');
          stone.classList.add('stone');
          stone.classList.add(val === 1 ? 'black' : 'white');
          cell.appendChild(stone);
        }
      }
    }
  }

  /**
   * Highlight the winning line after a player scores
   * @param {Array<[number, number]>} positions
   */
  function highlightWinningPositions(positions) {
    positions.forEach(([r, c]) => {
      const cell = boardContainer.children[r].children[c];
      const stone = cell.querySelector('.stone');
      if (stone) {
        stone.classList.add('win');
      }
    });
  }

  /**
   * Update the scoreboard area with current scores and player names
   */
  function updateScoreBoard() {
    const parts = [];
    players.forEach((id, index) => {
      const color = index === 0 ? 'Black' : 'White';
      const name = names[id] || `Player ${index + 1}`;
      const score = scores[id] || 0;
      parts.push(`${color} (${name}): ${score}`);
    });
    scoreBoardElem.textContent = parts.join(' | ');
  }

  /**
   * Update the turn indicator to show whose turn it is
   */
  function updateTurnIndicator() {
    if (players.length < 2) {
      turnIndicatorElem.textContent = 'Waiting for opponent…';
      return;
    }
    const isMyTurn = currentTurn === myIndex;
    const myColor = myIndex === 0 ? 'Black' : 'White';
    const oppColor = myIndex === 0 ? 'White' : 'Black';
    if (isMyTurn) {
      turnIndicatorElem.textContent = `Your turn (${myColor})`;
    } else {
      turnIndicatorElem.textContent = `Opponent's turn (${oppColor})`;
    }
  }

  /**
   * Handler for clicking a board cell. Emits a move to the server if it's this client's turn.
   * @param {MouseEvent} e
   */
  function handleCellClick(e) {
    if (!currentRoom) return;
    if (players.length < 2) return;
    if (myIndex !== currentTurn) return;
    const row = parseInt(e.currentTarget.dataset.row, 10);
    const col = parseInt(e.currentTarget.dataset.col, 10);
    const message = {
      type: 'placeStone',
      room: currentRoom,
      row,
      col,
    };
    socket.send(JSON.stringify(message));
  }

  /**
   * Reset client state when leaving or resetting the game
   */
  function resetClientState() {
    currentRoom = null;
    players = [];
    names = {};
    scores = {};
    currentTurn = 0;
    myIndex = null;
    board = [];
    clearMessage();
    updateScoreBoard();
    updateTurnIndicator();
  }

  /**
   * Connect to the server via WebSocket and set up event listeners
   */
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${location.host}/ws`;
    socket = new WebSocket(wsUrl);
    socket.addEventListener('open', () => {
      console.log('Connected to server');
    });
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    });
    socket.addEventListener('close', () => {
      showMessage('Disconnected from server.');
    });
    socket.addEventListener('error', (err) => {
      console.error('WebSocket error', err);
    });
  }

  /**
   * Handle incoming messages from the server
   * @param {Object} data
   */
  function handleServerMessage(data) {
    const type = data.type;
    switch (type) {
      case 'id':
        // Received our unique player ID from the server
        myId = data.id;
        break;
      case 'error':
        showMessage(data.message);
        break;
      case 'gameCreated':
        currentRoom = data.room;
        showView(waitingView);
        roomCodeElem.textContent = currentRoom;
        clearMessage();
        break;
      case 'gameStarted':
        currentRoom = data.room;
        board = JSON.parse(JSON.stringify(data.board));
        players = data.players;
        names = data.names;
        scores = data.scores;
        currentTurn = data.currentTurn;
        myIndex = players.indexOf(myId);
        buildBoard();
        renderBoard();
        updateScoreBoard();
        updateTurnIndicator();
        // Populate player info bar
        const infoParts = [];
        players.forEach((id, idx) => {
          const color = idx === 0 ? 'Black' : 'White';
          const name = names[id] || `Player ${idx + 1}`;
          infoParts.push(`${color}: ${name}`);
        });
        playerInfoElem.textContent = infoParts.join(' | ');
        showView(gameView);
        clearMessage();
        break;
      case 'moveMade':
        // Update board and turn after a move
        board = JSON.parse(JSON.stringify(data.board));
        currentTurn = data.currentTurn;
        renderBoard();
        updateTurnIndicator();
        clearMessage();
        break;
      case 'scoreUpdate':
        scores = data.scores;
        updateScoreBoard();
        highlightWinningPositions(data.winPositions);
        const winName = names[data.winner] || 'A player';
        showMessage(`${winName} scored a point!`);
        break;
      case 'gameReset':
        board = JSON.parse(JSON.stringify(data.board));
        scores = data.scores;
        renderBoard();
        updateScoreBoard();
        updateTurnIndicator();
        showMessage('Game and scores have been reset.');
        break;
      case 'playerLeft':
        const leftName = names[data.playerId] || 'Opponent';
        showMessage(`${leftName} has left the game.`);
        // Reset board locally but keep scores
        updateTurnIndicator();
        break;
      default:
        console.warn('Unknown message type', type);
    }
  }

  // UI event handlers
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const message = {
      type: 'createGame',
      name,
    };
    socket.send(JSON.stringify(message));
  });

  joinBtn.addEventListener('click', () => {
    const code = gameIdInput.value.trim().toUpperCase();
    if (!code) {
      showMessage('Please enter a game code.');
      return;
    }
    const name = nameInput.value.trim();
    const message = {
      type: 'joinGame',
      room: code,
      name,
    };
    socket.send(JSON.stringify(message));
  });

  cancelBtn.addEventListener('click', () => {
    // Simply reload the page to reset state
    location.reload();
  });

  resetBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    const message = {
      type: 'resetGame',
      room: currentRoom,
    };
    socket.send(JSON.stringify(message));
  });

  quitBtn.addEventListener('click', () => {
    location.reload();
  });

  // Initialize WebSocket connection when script loads
  connectWebSocket();
})();