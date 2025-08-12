// Ultimate Tic‑Tac‑Toe game logic and UI handling

/**
 * Represents the current player's mark ("X" or "O").
 * @type {string}
 */
let currentPlayer;

/**
 * Represents the state of each small board in the game.
 * Each entry is an array of nine strings: "X", "O" or "".
 * @type {string[][]}
 */
let smallBoards;

/**
 * Represents the state of the big board: each entry can be:
 *   ""  – board still in play;
 *   "X" – player X won that small board;
 *   "O" – player O won that small board;
 *   "T" – the small board ended in a tie.
 * @type {string[]}
 */
let bigBoard;

/**
 * Indicates which small board index (0–8) must be played next.
 * If null, any unfinished small board may be played.
 * @type {(number|null)}
 */
let nextBoardIndex;

/**
 * Flag indicating whether the overall game has ended.
 * @type {boolean}
 */
let gameOver;

// Multiplayer/networking variables
/**
 * Determines the current mode of play.  "local" means two players share one device.
 * "online" means two players connect across the internet using WebRTC/PeerJS.
 * @type {string}
 */
let mode = 'local';

/**
 * The PeerJS instance when playing online.  Initialized when hosting or joining.
 * @type {?any}
 */
let peer = null;

/**
 * The DataConnection instance representing the connection to the other player.
 * @type {?any}
 */
let conn = null;

/**
 * Your mark when playing online ("X" or "O").  Assigned when hosting/joining.
 * @type {?string}
 */
let myMark = null;

/**
 * The opponent's mark when playing online ("X" or "O").
 * @type {?string}
 */
let opponentMark = null;

/**
 * Flag indicating whether it's the local player's turn in online mode.
 * @type {boolean}
 */
let myTurn = false;

/**
 * Destroys any existing PeerJS instance and DataConnection.  Without
 * destroying the previous peer, multiple peers can remain registered
 * with the signalling server and cause connection or negotiation
 * failures【492118709471477†L344-L349】.  This helper cleans up state
 * before hosting or joining a new game.
 */
function destroyPeer() {
  if (peer) {
    try {
      peer.destroy();
    } catch (e) {
      // ignore any errors during destroy
    }
    peer = null;
  }
  conn = null;
}

// DOM elements for networking UI
const connectionPanelEl = document.getElementById('connection-panel');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const hostIdPanelEl = document.getElementById('host-id-panel');
const joinPanelEl = document.getElementById('join-panel');
const peerIdInputEl = document.getElementById('peer-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatusEl = document.getElementById('connection-status');
const gameIdSpan = document.getElementById('game-id');

// DOM elements
const ultimateBoardEl = document.getElementById('ultimate-board');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');

/**
 * Initializes or resets the game state and renders the board.
 */
function initGame() {
  // Start with an empty set of small boards and big board
  smallBoards = Array.from({ length: 9 }, () => Array(9).fill(''));
  bigBoard = Array(9).fill('');
  nextBoardIndex = null;
  currentPlayer = 'X';
  gameOver = false;
  renderBoard();
  updateStatus();
}

/**
 * Renders the entire ultimate board UI based on the current game state.
 */
function renderBoard() {
  // Clear existing board content
  ultimateBoardEl.innerHTML = '';

  // Create nine small boards
  for (let i = 0; i < 9; i++) {
    const smallBoardEl = document.createElement('div');
    smallBoardEl.classList.add('small-board');
    smallBoardEl.dataset.boardIndex = i;

    // Generate the nine cells inside each small board
    for (let j = 0; j < 9; j++) {
      const cellEl = document.createElement('div');
      cellEl.classList.add('small-cell');
      cellEl.dataset.boardIndex = i;
      cellEl.dataset.cellIndex = j;
      cellEl.textContent = smallBoards[i][j];

      // Only attach click listener if the board is still playable
      cellEl.addEventListener('click', handleCellClick);
      smallBoardEl.appendChild(cellEl);
    }

    // Add overlay for completed small boards
    if (bigBoard[i] === 'X' || bigBoard[i] === 'O') {
      smallBoardEl.classList.add('won', bigBoard[i].toLowerCase());
      const overlay = document.createElement('div');
      overlay.classList.add('winner-overlay');
      overlay.textContent = bigBoard[i];
      smallBoardEl.appendChild(overlay);
    } else if (bigBoard[i] === 'T') {
      smallBoardEl.classList.add('tie');
      const overlay = document.createElement('div');
      overlay.classList.add('winner-overlay');
      overlay.textContent = 'TIE';
      smallBoardEl.appendChild(overlay);
    }

    ultimateBoardEl.appendChild(smallBoardEl);
  }
  updateActiveBoards();
}

/**
 * Updates classes on each small board to show which boards are currently active/playable.
 */
function updateActiveBoards() {
  const boards = ultimateBoardEl.querySelectorAll('.small-board');
  boards.forEach((boardEl, idx) => {
    boardEl.classList.remove('active', 'inactive');

    // If the game is over, no boards should be active
    if (gameOver) {
      return;
    }

    // Determine whether this board is playable
    const boardFinished = bigBoard[idx] !== '';
    const forcedPlay = nextBoardIndex !== null;
    const isTargetBoard = idx === nextBoardIndex;

    if (forcedPlay) {
      if (!boardFinished && isTargetBoard) {
        boardEl.classList.add('active');
      } else {
        boardEl.classList.add('inactive');
      }
    } else {
      // No forced board: all unfinished boards are active
      if (!boardFinished) {
        boardEl.classList.add('active');
      } else {
        boardEl.classList.add('inactive');
      }
    }
  });
}

/**
 * Handles a player clicking on a cell. Performs validation and updates state accordingly.
 * @param {MouseEvent} e
 */
function handleCellClick(e) {
  // Ignore clicks if the game is over
  if (gameOver) return;
  // In online mode, only allow clicks on your turn
  if (mode === 'online' && !myTurn) return;
  const cellEl = e.currentTarget;
  const boardIdx = parseInt(cellEl.dataset.boardIndex, 10);
  const cellIdx = parseInt(cellEl.dataset.cellIndex, 10);

  // Enforce playing on the forced board if there is one
  if (nextBoardIndex !== null && boardIdx !== nextBoardIndex) return;
  // Ensure the small board isn't complete
  if (bigBoard[boardIdx] !== '') return;
  // Ensure the chosen cell is empty
  if (smallBoards[boardIdx][cellIdx] !== '') return;

  // Place the current player's mark
  smallBoards[boardIdx][cellIdx] = currentPlayer;
  cellEl.textContent = currentPlayer;

  // Check if this small board has been won or tied
  const smallBoardResult = checkBoardStatus(smallBoards[boardIdx]);
  if (smallBoardResult !== '') {
    bigBoard[boardIdx] = smallBoardResult;
  }

  // Check if the big board has a result
  const bigBoardResult = checkBoardStatus(bigBoard);
  if (bigBoardResult === 'X' || bigBoardResult === 'O' || bigBoardResult === 'T') {
    gameOver = true;
  }

  // Determine next forced small board
  if (!gameOver) {
    nextBoardIndex = cellIdx;
    // If that board is finished, free choice
    if (bigBoard[nextBoardIndex] !== '') {
      nextBoardIndex = null;
    }
    // Toggle the current player for next turn
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    // In online mode, toggle myTurn
    if (mode === 'online') {
      myTurn = false;
    }
  }

  // Send move to opponent if online
  if (mode === 'online' && conn && conn.open) {
    conn.send({ type: 'move', boardIdx: boardIdx, cellIdx: cellIdx });
  }

  // Re-render the board to update overlays and active indicators
  renderBoard();
  updateStatus();
}

/**
 * Determines the status of a 3×3 board represented as an array of nine strings.
 * Only "X" and "O" count as winning marks; "T" is treated as neutral.
 *
 * @param {string[]} board - An array of nine strings representing a board.
 * @returns {string} "X" or "O" if that player has won, "T" if tied, or "" if still undecided.
 */
function checkBoardStatus(board) {
  const winningLines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  // Check for a win first
  for (const [a, b, c] of winningLines) {
    const mark = board[a];
    if ((mark === 'X' || mark === 'O') && mark === board[b] && mark === board[c]) {
      return mark;
    }
  }
  // If no win, check for a tie (all positions filled with non-empty values)
  const full = board.every((val) => val !== '' && val !== 'T');
  if (full) return 'T';
  return '';
}

/**
 * Updates the status text based on the current mode and game state.
 */
function updateStatus() {
  if (mode === 'online') {
    if (gameOver) {
      // Determine winner
      const bigBoardResult = checkBoardStatus(bigBoard);
      if (bigBoardResult === myMark) {
        statusEl.textContent = 'You win!';
      } else if (bigBoardResult === opponentMark) {
        statusEl.textContent = 'You lose.';
      } else {
        statusEl.textContent = 'The game is a tie!';
      }
    } else {
      // Game still in progress
      statusEl.textContent = `You are ${myMark}. ` + (myTurn ? 'Your turn.' : 'Waiting for opponent...');
    }
  } else {
    // Local two-player mode
    if (gameOver) {
      const bigBoardResult = checkBoardStatus(bigBoard);
      if (bigBoardResult === 'X' || bigBoardResult === 'O') {
        statusEl.textContent = `Player ${bigBoardResult} wins the game!`;
      } else {
        statusEl.textContent = 'The game is a tie!';
      }
    } else {
      statusEl.textContent = `Current Player: ${currentPlayer}`;
    }
  }
}

// Multiplayer/online connection handlers

/**
 * Configures click listeners for hosting or joining an online game.
 */
function setupConnectionControls() {
  hostBtn.addEventListener('click', hostGame);
  joinBtn.addEventListener('click', () => {
    // Show join input panel
    hostBtn.style.display = 'none';
    joinBtn.style.display = 'none';
    hostIdPanelEl.style.display = 'none';
    joinPanelEl.style.display = 'flex';
  });
  connectBtn.addEventListener('click', joinGame);
}

/**
 * Hosts a new online game. Creates a PeerJS peer and waits for an incoming connection.
 */
function hostGame() {
  // Clean up any previous peer and start a new online session.
  destroyPeer();
  mode = 'online';

  // Configure our Peer with explicit host/port and a robust list of
  // STUN/TURN servers.  Multiple servers improve the chances of
  // negotiation success by offering several paths through NATs and
  // firewalls【556645367803417†L77-L169】.
  const peerOptions = {
    // Use the default PeerJS cloud server (0.peerjs.com:443) over HTTPS. The cloud
    // server includes a TURN relay that helps traverse symmetric NATs【492118709471477†L131-L136】.  We
    // still specify the host and port explicitly to avoid using an insecure
    // connection when served from file://.  Without specifying a host the
    // constructor will attempt to infer one from the current location which
    // fails in a static file context.
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    // Pass a robust ICE configuration.  Setting `iceTransportPolicy` to "relay"
    // forces WebRTC to route all traffic through TURN relays when NAT
    // traversal is required【758111880451420†L308-L323】.  We supply several free TURN
    // servers as fallbacks; each entry includes both UDP and TCP transports
    // running on ports 80 and 443 to maximise success through firewalls.  The
    // STUN entries remain for completeness but are ignored when the policy is
    // "relay".
    config: {
      iceTransportPolicy: 'relay',
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        { urls: 'turn:relay1.expressturn.com:3478', username: 'expressturn', credential: 'expressturn' },
        { urls: 'turn:relay1.expressturn.com:80?transport=tcp', username: 'expressturn', credential: 'expressturn' },
        { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        // Static-auth OpenRelay endpoints provide TURNS over ports 80/443; the
        // secret is documented by Metered Video and can be used without an
        // account【495118593026323†L65-L79】.  They offer better reliability through
        // SSL.
        { urls: 'turn:staticauth.openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turn:staticauth.openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' }
      ]
    },
    // Increase ping interval slightly above default (5 seconds) to reduce
    // frequency of heartbeat messages while still detecting dropped WebSocket
    // connections promptly【492118709471477†L219-L221】.
    pingInterval: 6000,
    // Enable verbose logging to the console; this aids debugging on mobile
    // devices when negotiating connections fails.
    debug: 2
  };
  peer = new Peer(undefined, peerOptions);

  // Update UI for host mode
  hostBtn.style.display = 'none';
  joinBtn.style.display = 'none';
  hostIdPanelEl.style.display = 'flex';
  joinPanelEl.style.display = 'none';
  connectionStatusEl.textContent = 'Initializing...';

  // Show our peer ID when ready
  peer.on('open', (id) => {
    gameIdSpan.textContent = id;
    connectionStatusEl.textContent = 'Waiting for opponent to join...';
  });

  // Handle errors on the Peer.  When a negotiation fails before a
  // DataConnection is fully open, show a specific message and wait for the
  // remote peer to retry.  Other errors are surfaced directly.
  peer.on('error', (err) => {
    if (err.type === 'negotiation-failed') {
      connectionStatusEl.textContent = 'Negotiation failed. Waiting for opponent to retry...';
    } else {
      connectionStatusEl.textContent = `Peer error: ${err.type}`;
    }
  });

  // Attempt to reconnect if we lose the signalling server connection【492118709471477†L351-L357】
  peer.on('disconnected', () => {
    connectionStatusEl.textContent = 'Disconnected from server. Reconnecting...';
    try {
      peer.reconnect();
    } catch (e) {
      // ignore
    }
  });

  // Accept incoming connections and start the game
  peer.on('connection', (connection) => {
    conn = connection;
    setupConnectionEvents();
    startOnlineGameAsHost();
  });
}

/**
 * Joins an existing online game by connecting to a host ID.
 */
function joinGame() {
  const destId = peerIdInputEl.value.trim();
  if (!destId) {
    connectionStatusEl.textContent = 'Please enter a game ID.';
    return;
  }
  // Clean up any previous session
  destroyPeer();
  mode = 'online';

  // Create a new peer with the same configuration as the host.  The
  // STUN/TURN list provides multiple fallback paths for NAT traversal【556645367803417†L77-L169】.
  const peerOptions = {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    config: {
      iceTransportPolicy: 'relay',
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        { urls: 'turn:relay1.expressturn.com:3478', username: 'expressturn', credential: 'expressturn' },
        { urls: 'turn:relay1.expressturn.com:80?transport=tcp', username: 'expressturn', credential: 'expressturn' },
        { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:staticauth.openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turn:staticauth.openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' }
      ]
    },
    pingInterval: 6000,
    debug: 2
  };
  peer = new Peer(undefined, peerOptions);

  // Update UI while connecting
  hostBtn.style.display = 'none';
  joinBtn.style.display = 'none';
  hostIdPanelEl.style.display = 'none';
  joinPanelEl.style.display = 'none';
  connectionStatusEl.textContent = 'Connecting...';

  // Helper to connect to the host.  Retries indefinitely until the host
  // becomes available.  The PeerServer holds offers for up to five
  // seconds before rejecting them【492118709471477†L149-L154】, so a
  // short delay improves reliability.
  const connectToHost = () => {
    if (!peer || peer.destroyed) {
      return;
    }
    conn = peer.connect(destId);
    conn.on('open', () => {
      setupConnectionEvents();
      startOnlineGameAsClient();
    });
    conn.on('error', (err) => {
      // Retry on peer-unavailable, network or negotiation-failed errors.  The
      // NegotiationFailed error indicates that the SDP exchange failed due to
      // incompatible ICE candidates; forcing a reconnect often resolves this.
      if (err.type === 'peer-unavailable' || err.type === 'network' || err.type === 'negotiation-failed') {
        setTimeout(connectToHost, 1500);
        connectionStatusEl.textContent = 'Negotiation failed, retrying...';
      } else {
        connectionStatusEl.textContent = `Connection error: ${err.type}`;
      }
    });
    conn.on('close', () => {
      connectionStatusEl.style.display = 'block';
      connectionStatusEl.textContent = 'Connection closed.';
    });
  };

  peer.on('open', connectToHost);
  peer.on('error', (err) => {
    connectionStatusEl.textContent = `Peer error: ${err.type}`;
  });
  peer.on('disconnected', () => {
    connectionStatusEl.textContent = 'Disconnected from server. Reconnecting...';
    try {
      peer.reconnect();
    } catch (e) {
      // ignore
    }
  });
}

/**
 * Sets up event handlers on the DataConnection once a peer-to-peer connection is open.
 */
function setupConnectionEvents() {
  if (!conn) return;
  // Indicate that a peer-to-peer connection has been established.  Keep
  // the status element visible so we can update it if the connection
  // later drops.
  connectionStatusEl.textContent = 'Connected!';
  connectionStatusEl.style.display = 'block';
  connectionPanelEl.style.display = 'none';

  // Handle incoming game messages from the remote peer.
  conn.on('data', (data) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'move') {
      handleRemoteMove(data.boardIdx, data.cellIdx);
    } else if (data.type === 'reset') {
      remoteReset();
    }
  });

  // Surface DataConnection errors to the user.  Connection errors can
  // occur independently of the Peer errors and are usually fatal.
  conn.on('error', (err) => {
    connectionStatusEl.style.display = 'block';
    // When negotiation fails on the established connection, prompt the user
    // that a retry is necessary.  The NegotiationFailed error type comes
    // from the WebRTC handshake and usually means the ICE candidate
    // exchange could not complete successfully【974931832278266†L940-L959】.  In that
    // case the client should close the connection and attempt to reconnect.
    if (err.type === 'negotiation-failed') {
      connectionStatusEl.textContent = 'Negotiation failed. Attempting to reset connection...';
      try {
        conn.close();
      } catch (e) {
        // ignore
      }
    } else {
      connectionStatusEl.textContent = `Connection error: ${err.type}`;
    }
  });

  // When the peer disconnects, inform the user.  We do not
  // automatically reconnect a game session because the opponent may
  // have left intentionally.
  conn.on('close', () => {
    connectionStatusEl.style.display = 'block';
    connectionStatusEl.textContent = 'Opponent disconnected.';
  });
}

/**
 * Starts a new game as the host. Assigns marks and turn order.
 */
function startOnlineGameAsHost() {
  myMark = 'X';
  opponentMark = 'O';
  myTurn = true;
  currentPlayer = 'X';
  nextBoardIndex = null;
  gameOver = false;
  initGame();
  updateStatus();
}

/**
 * Starts a new game as the client. Assigns marks and turn order.
 */
function startOnlineGameAsClient() {
  myMark = 'O';
  opponentMark = 'X';
  myTurn = false;
  currentPlayer = 'X';
  nextBoardIndex = null;
  gameOver = false;
  initGame();
  updateStatus();
}

/**
 * Handles a move received from the remote peer. Updates board state and UI.
 * @param {number} boardIdx
 * @param {number} cellIdx
 */
function handleRemoteMove(boardIdx, cellIdx) {
  if (gameOver) return;
  // Only process if the small board and cell are valid
  if (bigBoard[boardIdx] !== '') return;
  if (smallBoards[boardIdx][cellIdx] !== '') return;
  // Place the opponent's mark
  smallBoards[boardIdx][cellIdx] = opponentMark;
  // Check for a result on that small board
  const sbResult = checkBoardStatus(smallBoards[boardIdx]);
  if (sbResult !== '') {
    bigBoard[boardIdx] = sbResult;
  }
  // Check the big board status
  const bbResult = checkBoardStatus(bigBoard);
  if (bbResult === myMark || bbResult === opponentMark || bbResult === 'T') {
    gameOver = true;
  }
  // Determine the next board forced
  nextBoardIndex = cellIdx;
  if (bigBoard[nextBoardIndex] !== '') {
    nextBoardIndex = null;
  }
  // Switch turn back to local player
  currentPlayer = myMark;
  myTurn = true;
  renderBoard();
  updateStatus();
}

/**
 * Handles a reset initiated by the remote peer.
 */
function remoteReset() {
  initGame();
  // In online mode, host (X) always goes first after a reset
  currentPlayer = 'X';
  gameOver = false;
  myTurn = (myMark === 'X');
  updateStatus();
}

// Override reset button to support online mode
resetBtn.addEventListener('click', () => {
  if (mode === 'online' && conn && conn.open) {
    conn.send({ type: 'reset' });
  }
  initGame();
  // In online mode, host always goes first
  if (mode === 'online') {
    currentPlayer = 'X';
    myTurn = (myMark === 'X');
    gameOver = false;
  }
  updateStatus();
});

// Set up event listeners for connection controls
setupConnectionControls();

// Initialize game on page load
initGame();