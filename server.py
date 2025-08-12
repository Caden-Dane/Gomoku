#!/usr/bin/env python3
"""
Gomoku Multiplayer Server (Python)
---------------------------------

This server uses `aiohttp` to serve static files and handle WebSocket
connections for a real‑time Gomoku game.  Players can create a game,
join via a six‑character code, place stones on a shared board, earn
points for forming lines of five or more, and continue playing rounds
until they choose to reset or quit.  The server manages game state for
each room and broadcasts updates to connected clients.

The protocol between client and server is JSON‑based.  Each message
contains a `type` field indicating its purpose and additional fields
as required.  See the client code for specifics.
"""

import asyncio
import json
import random
import string
from aiohttp import web
from typing import Dict, List, Optional, Tuple


# Constants
BOARD_SIZE = 15


def generate_room_code() -> str:
    """Generate a unique six‑character room code consisting of
    uppercase letters and digits.  The room codes are checked
    against existing games to ensure uniqueness."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in games:
            return code


def create_empty_board(size: int) -> List[List[int]]:
    """Create an empty NxN board initialized with zeros."""
    return [[0 for _ in range(size)] for _ in range(size)]


def check_victory(board: List[List[int]], row: int, col: int, player: int) -> Optional[List[Tuple[int, int]]]:
    """Check if placing a stone at (row, col) forms a contiguous line of
    five or more for the given player.  Returns the positions of the
    winning stones if a win occurs, otherwise None."""
    size = len(board)
    directions = [
        (1, 0),   # vertical
        (0, 1),   # horizontal
        (1, 1),   # diagonal down‑right
        (1, -1),  # diagonal down‑left
    ]
    for dx, dy in directions:
        count = 1
        positions = [(row, col)]
        # Forward direction
        x, y = row + dx, col + dy
        while 0 <= x < size and 0 <= y < size and board[x][y] == player:
            positions.append((x, y))
            count += 1
            x += dx
            y += dy
        # Backward direction
        x, y = row - dx, col - dy
        while 0 <= x < size and 0 <= y < size and board[x][y] == player:
            positions.append((x, y))
            count += 1
            x -= dx
            y -= dy
        if count >= 5:
            return positions
    return None


# Data structures to track connections and games
connections: Dict[web.WebSocketResponse, Dict[str, Optional[str]]] = {}

games: Dict[str, Dict] = {}


async def send_json(ws: web.WebSocketResponse, message: Dict) -> None:
    """Send a JSON message over a WebSocket connection.  If the socket
    is closed, ignore errors."""
    if ws.closed:
        return
    try:
        await ws.send_json(message)
    except Exception:
        # Ignore send errors for closed/errored sockets
        pass


async def broadcast(game: Dict, message: Dict) -> None:
    """Broadcast a message to all players in a game."""
    tasks = []
    for player in game['players']:
        tasks.append(send_json(player['ws'], message))
    if tasks:
        await asyncio.gather(*tasks)


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """Handle incoming WebSocket connections and route messages based on
    their `type` field."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    # Assign a unique player ID
    player_id = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    connections[ws] = {'id': player_id, 'room': None}
    # Send the id to the client
    await send_json(ws, {'type': 'id', 'id': player_id})
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    await send_json(ws, {'type': 'error', 'message': 'Invalid JSON'})
                    continue
                msg_type = data.get('type')
                # Handle each message type
                if msg_type == 'createGame':
                    await handle_create_game(ws, data)
                elif msg_type == 'joinGame':
                    await handle_join_game(ws, data)
                elif msg_type == 'placeStone':
                    await handle_place_stone(ws, data)
                elif msg_type == 'resetGame':
                    await handle_reset_game(ws, data)
                else:
                    await send_json(ws, {'type': 'error', 'message': f'Unknown message type: {msg_type}'})
            elif msg.type == web.WSMsgType.ERROR:
                print(f'WebSocket connection closed with exception: {ws.exception()}')
    finally:
        # Clean up on disconnect
        await handle_disconnect(ws)
    return ws


async def handle_create_game(ws: web.WebSocketResponse, data: Dict) -> None:
    """Create a new game room and put the requesting player into it."""
    player_info = connections[ws]
    # Prevent creating multiple games if already in one
    if player_info['room']:
        await send_json(ws, {'type': 'error', 'message': 'You are already in a game'})
        return
    room = generate_room_code()
    board = create_empty_board(BOARD_SIZE)
    game = {
        'board': board,
        'players': [],
        'names': {},
        'scores': {},
        'current_turn': 0,
        'winner_positions': [],
    }
    # Create player object and add to game
    player_obj = {'id': player_info['id'], 'ws': ws}
    game['players'].append(player_obj)
    name = data.get('name') or 'Player 1'
    game['names'][player_info['id']] = name
    game['scores'][player_info['id']] = 0
    games[room] = game
    player_info['room'] = room
    # Inform the client of the room code
    await send_json(ws, {'type': 'gameCreated', 'room': room})
    print(f'Game {room} created by player {player_info["id"]}')


async def handle_join_game(ws: web.WebSocketResponse, data: Dict) -> None:
    """Join an existing game room as the second player."""
    player_info = connections[ws]
    if player_info['room']:
        await send_json(ws, {'type': 'error', 'message': 'You are already in a game'})
        return
    room = (data.get('room') or '').upper()
    if not room or room not in games:
        await send_json(ws, {'type': 'error', 'message': 'Game code not found'})
        return
    game = games[room]
    if len(game['players']) >= 2:
        await send_json(ws, {'type': 'error', 'message': 'Game is full'})
        return
    # Add the new player
    player_obj = {'id': player_info['id'], 'ws': ws}
    game['players'].append(player_obj)
    name = data.get('name') or 'Player 2'
    game['names'][player_info['id']] = name
    game['scores'][player_info['id']] = 0
    player_info['room'] = room
    # Send gameStarted to all players
    message = {
        'type': 'gameStarted',
        'room': room,
        'board': game['board'],
        'players': [p['id'] for p in game['players']],
        'names': game['names'],
        'scores': game['scores'],
        'currentTurn': game['current_turn'],
    }
    await broadcast(game, message)
    print(f'Player {player_info["id"]} joined game {room}')


async def handle_place_stone(ws: web.WebSocketResponse, data: Dict) -> None:
    """Handle a player's move, update game state, and broadcast updates."""
    player_info = connections.get(ws)
    if not player_info:
        return
    room = player_info.get('room')
    if not room or room not in games:
        await send_json(ws, {'type': 'error', 'message': 'Game not found'})
        return
    game = games[room]
    # Ensure two players are present
    if len(game['players']) < 2:
        await send_json(ws, {'type': 'error', 'message': 'Waiting for opponent'})
        return
    # Determine this player's index
    player_ids = [p['id'] for p in game['players']]
    if player_info['id'] not in player_ids:
        await send_json(ws, {'type': 'error', 'message': 'You are not part of this game'})
        return
    player_index = player_ids.index(player_info['id'])
    if player_index != game['current_turn']:
        await send_json(ws, {'type': 'error', 'message': 'Not your turn'})
        return
    # Validate row and column
    row = data.get('row')
    col = data.get('col')
    try:
        row = int(row)
        col = int(col)
    except (TypeError, ValueError):
        await send_json(ws, {'type': 'error', 'message': 'Invalid row or column'})
        return
    # Validate that the move is within the current dynamic board bounds
    board_size = len(game['board'])
    if not (0 <= row < board_size and 0 <= col < board_size):
        await send_json(ws, {'type': 'error', 'message': 'Invalid position'})
        return
    if game['board'][row][col] != 0:
        await send_json(ws, {'type': 'error', 'message': 'Cell already occupied'})
        return
    # Place the stone
    player_value = player_index + 1
    game['board'][row][col] = player_value
    # Check for victory
    win_positions = check_victory(game['board'], row, col, player_value)
    if win_positions:
        # Update score
        winner_id = player_info['id']
        game['scores'][winner_id] = game['scores'].get(winner_id, 0) + 1
        game['winner_positions'] = win_positions
        # Notify players of score update and winning line
        await broadcast(game, {
            'type': 'scoreUpdate',
            'scores': game['scores'],
            'winner': winner_id,
            'winPositions': win_positions,
        })
        # Instead of resetting the board, enlarge it by adding an extra row and column.
        # The existing stones remain in place and the scoring player keeps the turn.
        old_board = game['board']
        old_size = len(old_board)
        new_size = old_size + 1
        new_board = create_empty_board(new_size)
        # Copy the old board into the new board (top‑left corner)
        for i in range(old_size):
            for j in range(old_size):
                new_board[i][j] = old_board[i][j]
        game['board'] = new_board
        # The scoring player takes the next turn
        game['current_turn'] = player_index
    else:
        # Switch turn to the other player
        game['current_turn'] = 1 - game['current_turn']
    # Broadcast the move and updated board/turn
    await broadcast(game, {
        'type': 'moveMade',
        'room': room,
        'row': row,
        'col': col,
        'playerIndex': player_index,
        'board': game['board'],
        'currentTurn': game['current_turn'],
    })


async def handle_reset_game(ws: web.WebSocketResponse, data: Dict) -> None:
    """Reset the board and scores for a game."""
    player_info = connections.get(ws)
    if not player_info:
        return
    room = player_info.get('room')
    if not room or room not in games:
        await send_json(ws, {'type': 'error', 'message': 'Game not found'})
        return
    game = games[room]
    # Reset board to initial size and scores
    game['board'] = create_empty_board(BOARD_SIZE)
    game['scores'] = {}
    for player in game['players']:
        game['scores'][player['id']] = 0
    # Reset turn to the first player (index 0)
    game['current_turn'] = 0
    # Notify players, including the new currentTurn so clients update accordingly
    await broadcast(game, {
        'type': 'gameReset',
        'board': game['board'],
        'scores': game['scores'],
        'currentTurn': game['current_turn'],
    })


async def handle_disconnect(ws: web.WebSocketResponse) -> None:
    """Handle cleanup when a WebSocket client disconnects."""
    player_info = connections.pop(ws, None)
    if not player_info:
        return
    room = player_info.get('room')
    if not room or room not in games:
        return
    game = games[room]
    # Remove player from game
    remaining_players = []
    for p in game['players']:
        if p['ws'] is not ws:
            remaining_players.append(p)
    game['players'] = remaining_players
    # Remove from names and scores
    if player_info['id'] in game['names']:
        del game['names'][player_info['id']]
    if player_info['id'] in game['scores']:
        del game['scores'][player_info['id']]
    # If no players remain, delete the game
    if not game['players']:
        del games[room]
        return
    # If one player remains, reset the board so a new opponent can join
    game['board'] = create_empty_board(BOARD_SIZE)
    game['current_turn'] = 0
    # Notify the remaining player
    await broadcast(game, {
        'type': 'playerLeft',
        'playerId': player_info['id'],
    })


async def index(request: web.Request) -> web.Response:
    """Serve the index page."""
    return web.FileResponse(path=str(request.app['static_dir'] / 'index.html'))


def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()
    # Store path to static files in app for easy access
    import pathlib
    app['static_dir'] = pathlib.Path(__file__).parent / 'public'
    # Routes
    app.router.add_get('/', index)
    app.router.add_get('/ws', websocket_handler)
    # Serve static files from the public directory.  Static files are served at the
    # root ("/") but the WebSocket endpoint and index route take precedence.
    app.router.add_static('/', path=str(app['static_dir']), show_index=False, follow_symlinks=True)

    # Provide a shortcut route for the Ultimate Tic‑Tac‑Toe game.  Without this
    # explicit route, requesting "/ultimate" would return a 403 because static
    # directories do not return an index document when show_index=False.  The
    # handlers below redirect both `/ultimate` and `/ultimate/` to the
    # `index.html` in the `ultimate` subdirectory so that users can access
    # the game without specifying the full path【365635131868379†screenshot】.
    async def ultimate_index(request: web.Request) -> web.Response:
        return web.FileResponse(path=str(app['static_dir'] / 'ultimate' / 'index.html'))

    app.router.add_get('/ultimate', ultimate_index)
    app.router.add_get('/ultimate/', ultimate_index)
    return app


def main() -> None:
    app = create_app()
    port = int(__import__('os').environ.get('PORT', 3000))
    web.run_app(app, port=port)


if __name__ == '__main__':
    main()