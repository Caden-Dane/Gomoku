const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Create an Express application to serve static content
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve the static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Holds the state for all active games. Keys are room codes, values are game objects.
 * Each game object looks like:
 * {
 *   board: 2D array of numbers (0 empty, 1 player1, 2 player2),
 *   players: [socketId1, socketId2],
 *   names: {socketId1: name1, socketId2: name2},
 *   scores: {socketId1: 0, socketId2: 0},
 *   currentTurn: 0 or 1, index into players array,
 *   winnerPositions: array of [row, col] pairs forming the last win (for highlighting)
 * }
 */
const games = {};

/**
 * Generate a unique alphanumeric room code.
 * Codes are six characters long and consist of uppercase letters and digits.
 * @returns {string} A unique room code
 */
function generateRoomCode() {
  const length = 6;
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < length; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
  } while (games[code]);
  return code;
}

/**
 * Create an empty NxN board, filled with zeros.
 * @param {number} size The dimension of the board (size x size)
 * @returns {number[][]} A 2D array representing the game board
 */
function createEmptyBoard(size) {
  const board = [];
  for (let i = 0; i < size; i++) {
    const row = [];
    for (let j = 0; j < size; j++) {
      row.push(0);
    }
    board.push(row);
  }
  return board;
}

/**
 * Check if placing a stone results in a line of five or more contiguous stones.
 * Evaluates all four principal directions (horizontal, vertical, two diagonals).
 * @param {number[][]} board The current board state
 * @param {number} row The row index of the placed stone
 * @param {number} col The column index of the placed stone
 * @param {number} player The numeric identifier of the player (1 or 2)
 * @returns {Array<[number, number]>|null} Array of positions making up the winning line or null if no win
 */
function checkVictory(board, row, col, player) {
  const size = board.length;
  const directions = [
    [1, 0],  // vertical
    [0, 1],  // horizontal
    [1, 1],  // diagonal down-right
    [1, -1], // diagonal down-left
  ];
  for (const [dx, dy] of directions) {
    let count = 1;
    const positions = [[row, col]];
    // Traverse forward
    let x = row + dx;
    let y = col + dy;
    while (x >= 0 && x < size && y >= 0 && y < size && board[x][y] === player) {
      positions.push([x, y]);
      count++;
      x += dx;
      y += dy;
    }
    // Traverse backward
    x = row - dx;
    y = col - dy;
    while (x >= 0 && x < size && y >= 0 && y < size && board[x][y] === player) {
      positions.push([x, y]);
      count++;
      x -= dx;
      y -= dy;
    }
    if (count >= 5) {
      return positions;
    }
  }
  return null;
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  /**
   * Client requests to create a new game. A unique room code is generated and
   * the client is put into that room as the first player.
   * @param {Object} params
   * @param {string} params.name The player's name
   * @param {Function} callback Acknowledgement callback
   */
  socket.on('createGame', ({ name }, callback) => {
    const room = generateRoomCode();
    const board = createEmptyBoard(15);
    games[room] = {
      board,
      players: [socket.id],
      names: {},
      scores: {},
      currentTurn: 0,
      winnerPositions: [],
    };
    games[room].names[socket.id] = name || 'Player 1';
    games[room].scores[socket.id] = 0;
    socket.join(room);
    if (callback) callback({ room });
    socket.emit('gameCreated', { room });
    console.log(`Game created ${room} by ${socket.id}`);
  });

  /**
   * Client requests to join an existing game. If the room exists and has space,
   * the client is added as the second player and both players receive a
   * 'gameStarted' event to begin play.
   * @param {Object} params
   * @param {string} params.room The room code to join
   * @param {string} params.name The player's name
   * @param {Function} callback Acknowledgement callback
   */
  socket.on('joinGame', ({ room, name }, callback) => {
    room = room ? room.toUpperCase() : '';
    if (!games[room]) {
      callback && callback({ error: 'Game code not found' });
      return;
    }
    const game = games[room];
    if (game.players.length >= 2) {
      callback && callback({ error: 'Game is full' });
      return;
    }
    game.players.push(socket.id);
    game.names[socket.id] = name || 'Player 2';
    game.scores[socket.id] = 0;
    socket.join(room);
    callback && callback({ success: true });
    // Notify both players that the game has started
    io.to(room).emit('gameStarted', {
      room,
      board: game.board,
      players: game.players,
      names: game.names,
      scores: game.scores,
      currentTurn: game.currentTurn,
    });
    console.log(`Player ${socket.id} joined game ${room}`);
  });

  /**
   * Handle a player's move. Validates turn order and occupancy, updates the board,
   * checks for a win, updates scores if needed, resets the board after a score,
   * toggles the turn, and broadcasts the move to all players in the room.
   */
  socket.on('placeStone', ({ room, row, col }, callback) => {
    const game = games[room];
    if (!game) {
      callback && callback({ error: 'Game not found' });
      return;
    }
    const playerIndex = game.players.indexOf(socket.id);
    if (playerIndex === -1) {
      callback && callback({ error: 'Player not in game' });
      return;
    }
    // Only allow the correct player to move
    if (playerIndex !== game.currentTurn) {
      callback && callback({ error: 'Not your turn' });
      return;
    }
    if (!game.board[row] || game.board[row][col] === undefined) {
      callback && callback({ error: 'Invalid position' });
      return;
    }
    // Occupied cell check
    if (game.board[row][col] !== 0) {
      callback && callback({ error: 'Cell already occupied' });
      return;
    }
    const playerValue = playerIndex + 1;
    game.board[row][col] = playerValue;
    // Check for victory (five in a row or more)
    const winPositions = checkVictory(game.board, row, col, playerValue);
    if (winPositions) {
      const playerId = game.players[playerIndex];
      game.scores[playerId] = (game.scores[playerId] || 0) + 1;
      game.winnerPositions = winPositions;
      // Inform players of the updated score and winning positions
      io.to(room).emit('scoreUpdate', {
        scores: game.scores,
        winner: playerId,
        winPositions,
      });
      // Reset the board for the next round
      game.board = createEmptyBoard(15);
      // The player who scored gets the next turn
      game.currentTurn = playerIndex;
      // Broadcast the reset board as part of moveMade to reflect on clients
    } else {
      // Alternate the turn
      game.currentTurn = 1 - game.currentTurn;
    }
    // Broadcast move and current turn information to both players
    io.to(room).emit('moveMade', {
      room,
      row,
      col,
      playerIndex,
      board: game.board,
      currentTurn: game.currentTurn,
    });
    callback && callback({ success: true });
  });

  /**
   * Reset the entire game, clearing the board and resetting scores. Both players
   * remain in the room. Useful if players wish to start a fresh series.
   */
  socket.on('resetGame', ({ room }, callback) => {
    const game = games[room];
    if (!game) {
      callback && callback({ error: 'Game not found' });
      return;
    }
    // Recreate the board and reset scores
    game.board = createEmptyBoard(15);
    game.scores = {};
    game.players.forEach((id) => {
      game.scores[id] = 0;
    });
    game.currentTurn = 0;
    io.to(room).emit('gameReset', {
      board: game.board,
      scores: game.scores,
    });
    callback && callback({ success: true });
  });

  /**
   * Handle disconnections. Remove the player from any game they were in, notify
   * the remaining player, and clean up the game if empty.
   */
  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    for (const [room, game] of Object.entries(games)) {
      const index = game.players.indexOf(socket.id);
      if (index !== -1) {
        // Remove the player
        game.players.splice(index, 1);
        delete game.names[socket.id];
        delete game.scores[socket.id];
        io.to(room).emit('playerLeft', { playerId: socket.id });
        // If no players remain, delete the game entirely
        if (game.players.length === 0) {
          delete games[room];
        } else {
          // If one player remains, reset the board so a new opponent can join
          game.board = createEmptyBoard(15);
          game.currentTurn = 0;
        }
        break;
      }
    }
  });
});

// Start the HTTP server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});