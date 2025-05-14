import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Serve static files from client directory
app.use(express.static(join(__dirname, "../client")));

// Basic route for the root path
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "../client/index.html"));
});

// Game constants
const BOARD_WIDTH = 15;
const BOARD_HEIGHT = 15;
const GAME_DURATION = 180; // 3 minutes in seconds
const BOMB_TIMER = 3; // Seconds until bomb explodes
const EXPLOSION_RADIUS = 2; // How far the explosion reaches

// Game state
const gameState = {
  players: {},
  board: [],
  bombs: [],
  gameActive: false,
  gameTimer: GAME_DURATION,
  timerInterval: null,
};

// Generate a random color
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Get initial player positions (corners of the map)
function getPlayerStartPosition(playerCount) {
  const startPositions = [
    { x: 1, y: 1 }, // Top-left
    { x: BOARD_WIDTH - 2, y: BOARD_HEIGHT - 2 }, // Bottom-right
    { x: 1, y: BOARD_HEIGHT - 2 }, // Bottom-left
    { x: BOARD_WIDTH - 2, y: 1 }, // Top-right
  ];

  // Make sure we don't exceed array bounds
  const index = playerCount % startPositions.length;
  return { ...startPositions[index] }; // Return a new object to avoid reference issues
}

// Initialize game board
function initializeBoard() {
  const board = Array(BOARD_HEIGHT)
    .fill()
    .map(() => Array(BOARD_WIDTH).fill(0));

  // Create border walls
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      // Border walls
      if (
        x === 0 ||
        y === 0 ||
        x === BOARD_WIDTH - 1 ||
        y === BOARD_HEIGHT - 1
      ) {
        board[y][x] = 1; // Solid wall
      }
      // Grid pattern for solid walls
      else if (x % 2 === 0 && y % 2 === 0) {
        board[y][x] = 1; // Solid wall
      }
      // Add some destructible blocks (70% chance for non-corner positions)
      else if (Math.random() < 0.7 && !isCornerPosition(x, y)) {
        board[y][x] = 2; // Destructible block
      }
    }
  }

  // Ensure safe starting areas in corners
  clearCornerArea(board, 1, 1); // Top-left
  clearCornerArea(board, BOARD_WIDTH - 2, 1); // Top-right
  clearCornerArea(board, 1, BOARD_HEIGHT - 2); // Bottom-left
  clearCornerArea(board, BOARD_WIDTH - 2, BOARD_HEIGHT - 2); // Bottom-right

  return board;
}

// Check if position is one of the starting corners
function isCornerPosition(x, y) {
  const cornerPositions = [
    { x: 1, y: 1 }, // Top-left
    { x: 2, y: 1 },
    { x: 1, y: 2 }, // Adjacent to top-left
    { x: BOARD_WIDTH - 2, y: 1 }, // Top-right
    { x: BOARD_WIDTH - 3, y: 1 },
    { x: BOARD_WIDTH - 2, y: 2 }, // Adjacent to top-right
    { x: 1, y: BOARD_HEIGHT - 2 }, // Bottom-left
    { x: 2, y: BOARD_HEIGHT - 2 },
    { x: 1, y: BOARD_HEIGHT - 3 }, // Adjacent to bottom-left
    { x: BOARD_WIDTH - 2, y: BOARD_HEIGHT - 2 }, // Bottom-right
    { x: BOARD_WIDTH - 3, y: BOARD_HEIGHT - 2 },
    { x: BOARD_WIDTH - 2, y: BOARD_HEIGHT - 3 }, // Adjacent to bottom-right
  ];

  return cornerPositions.some((pos) => pos.x === x && pos.y === y);
}

// Clear the area around a corner for safe player spawning
function clearCornerArea(board, x, y) {
  board[y][x] = 0; // Center

  // Immediate adjacent cells
  const adjacentCells = [
    { x: x + 1, y: y },
    { x: x - 1, y: y },
    { x: x, y: y + 1 },
    { x: x, y: y - 1 },
  ];

  adjacentCells.forEach((cell) => {
    if (
      cell.x > 0 &&
      cell.x < BOARD_WIDTH - 1 &&
      cell.y > 0 &&
      cell.y < BOARD_HEIGHT - 1 &&
      board[cell.y][cell.x] !== 1 // Don't clear solid walls
    ) {
      board[cell.y][cell.x] = 0;
    }
  });
}

// Modify the startNewGame function
function startNewGame() {
  gameState.board = initializeBoard();
  gameState.bombs = [];
  gameState.gameActive = true;
  gameState.gameTimer = GAME_DURATION;

  // Reset player states and assign correct starting positions
  const players = Object.values(gameState.players);
  players.forEach((player, index) => {
    const startPos = getPlayerStartPosition(index);
    player.position = startPos;
    player.bombsAvailable = 1;
    player.bombRadius = EXPLOSION_RADIUS;
    player.alive = true;
    player.lives = 3; // <-- Reset lives at new game
  });

  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
  }

  gameState.timerInterval = setInterval(() => {
    gameState.gameTimer--;
    if (gameState.gameTimer <= 0) {
      endGame();
    }
    // Send a sanitized version of the game state
    io.emit("gameState", sanitizeGameState(gameState));
  }, 1000);

  // Send initial game state
  io.emit("gameState", sanitizeGameState(gameState));
}

// Add a function to sanitize game state before sending
function sanitizeGameState(state) {
  return {
    players: { ...state.players },
    board: state.board.map((row) => [...row]),
    bombs: state.bombs.map((bomb) => ({
      id: bomb.id,
      position: { ...bomb.position },
      timer: bomb.timer,
      radius: bomb.radius,
      playerId: bomb.playerId,
    })),
    gameActive: state.gameActive,
    gameTimer: state.gameTimer,
  };
}

// End the current game and determine winner
function endGame() {
  clearInterval(gameState.timerInterval);
  gameState.gameActive = false;

  // Find alive players
  const alivePlayers = Object.values(gameState.players).filter(
    (player) => player.alive
  );

  // If there's a winner
  if (alivePlayers.length === 1) {
    const winner = alivePlayers[0];
    winner.score += 10; // Award points for winning
    io.emit("gameOver", winner);
  }
  // If time ran out with multiple players alive
  else if (alivePlayers.length > 1) {
    // Award points to all survivors
    alivePlayers.forEach((player) => {
      player.score += 5;
    });
    io.emit("gameOver", { name: "Time's up! Multiple survivors" });
  }
  // If everyone died (draw)
  else {
    io.emit("gameOver", { name: "Draw! Everyone was eliminated" });
  }

  // Start a new game after delay
  setTimeout(() => {
    startNewGame();
  }, 10000);
}

// Place a bomb on the board
function placeBomb(playerId) {
  const player = gameState.players[playerId];
  if (!player || !player.alive || player.bombsAvailable <= 0) return;

  const position = { ...player.position };

  // Check if there's already a bomb at this position
  const existingBomb = gameState.bombs.find(
    (bomb) => bomb.position.x === position.x && bomb.position.y === position.y
  );

  if (existingBomb) return;

  // Add bomb to game state
  const bomb = {
    id: Date.now().toString(),
    position,
    timer: BOMB_TIMER,
    radius: player.bombRadius,
    playerId,
  };

  gameState.bombs.push(bomb);
  player.bombsAvailable--;

  // Notify clients about the new bomb
  io.emit("bombPlaced", bomb);

  // Set timer for bomb explosion
  const bombInterval = setInterval(() => {
    bomb.timer--;

    if (bomb.timer <= 0) {
      clearInterval(bombInterval);
      explodeBomb(bomb);
    }
  }, 1000);
}

// Handle bomb explosion
function explodeBomb(bomb) {
  // Create explosion data
  const explosionTiles = getExplosionTiles(bomb);
  const explosion = {
    position: bomb.position,
    tiles: explosionTiles,
    playerId: bomb.playerId,
  };

  // Return bomb to player's inventory
  const player = gameState.players[bomb.playerId];
  if (player) {
    player.bombsAvailable++;
  }

  // Remove bomb from game state
  gameState.bombs = gameState.bombs.filter((b) => b.id !== bomb.id);

  // Destroy blocks and check for player hits
  handleExplosionEffects(explosion);

  // Notify clients about the explosion
  io.emit("bombExploded", explosion);
  io.emit("gameState", sanitizeGameState(gameState));

  // Check if game should end
  checkGameEnd();
}

// Get tiles affected by explosion
function getExplosionTiles(bomb) {
  const tiles = [];
  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 1, dy: 0 }, // Right
    { dx: 0, dy: 1 }, // Down
    { dx: -1, dy: 0 }, // Left
  ];

  // Check each direction from the bomb
  directions.forEach((dir) => {
    for (let i = 1; i <= bomb.radius; i++) {
      const x = bomb.position.x + dir.dx * i;
      const y = bomb.position.y + dir.dy * i;

      // Check if out of bounds
      if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) {
        break;
      }

      const tileType = gameState.board[y][x];

      // Add explosion tile
      tiles.push({ x, y });

      // Stop at walls
      if (tileType === 1) {
        break;
      }

      // Stop at destructible blocks (but include them in explosion)
      if (tileType === 2) {
        break;
      }
    }
  });

  return tiles;
}

// Handle effects of explosion (destroy blocks, hurt players)
function handleExplosionEffects(explosion) {
  const allExplosionTiles = [explosion.position, ...explosion.tiles];

  // Process each tile in the explosion
  allExplosionTiles.forEach((tile) => {
    const { x, y } = tile;

    // Destroy destructible blocks
    if (gameState.board[y][x] === 2) {
      gameState.board[y][x] = 0;

      // 20% chance to spawn a power-up
      if (Math.random() < 0.2) {
        gameState.board[y][x] = 3; // Power-up
      }
    }

    // Check for players in explosion
    Object.values(gameState.players).forEach((player) => {
      if (player.alive && player.position.x === x && player.position.y === y) {
        player.lives--;
        if (player.lives > 0) {
          // Respawn player at starting position
          const playerIndex = Object.values(gameState.players).findIndex(
            (p) => p.id === player.id
          );
          const respawnPos = getPlayerStartPosition(playerIndex);
          player.position = { ...respawnPos };
          player.alive = true;
          // Optionally reset bombsAvailable and bombRadius if desired
          io.emit("playerRespawned", player);
        } else {
          player.alive = false;
          // Award point to bomber if it wasn't self-kill
          if (player.id !== explosion.playerId) {
            const bomber = gameState.players[explosion.playerId];
            if (bomber) {
              bomber.score += 1;
            }
          }
          io.emit("playerEliminated", player);
        }
      }
    });

    // Chain reaction - explode other bombs
    gameState.bombs.forEach((bomb) => {
      if (bomb.position.x === x && bomb.position.y === y) {
        // Set this bomb to explode immediately
        bomb.timer = 0;
      }
    });
  });
}

// Check if game should end (only one player left)
function checkGameEnd() {
  // Only count players who have lives left
  const alivePlayers = Object.values(gameState.players).filter(
    (player) => player.lives > 0
  );

  if (
    gameState.gameActive &&
    alivePlayers.length <= 1 &&
    Object.keys(gameState.players).length > 1
  ) {
    endGame();
  }
}

// Collect power-up
function collectPowerUp(player) {
  const { x, y } = player.position;

  if (gameState.board[y][x] === 3) {
    // Random power-up effect
    const powerUpType = Math.floor(Math.random() * 2);

    switch (powerUpType) {
      case 0: // Extra bomb
        player.bombsAvailable++;
        break;
      case 1: // Larger explosion radius
        player.bombRadius++;
        break;
    }

    // Remove power-up from board
    gameState.board[y][x] = 0;

    // Notify clients
    io.emit("gameState", sanitizeGameState(gameState));
  }
}

// Modify the socket connection handling
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle chat messages
  socket.on("chatMessage", (message) => {
    const player = gameState.players[socket.id];
    if (player) {
      // Sanitize the message to prevent XSS while preserving emojis
      const sanitizedMessage = message.replace(/[<>]/g, "");

      const chatData = {
        sender: player.name,
        message: sanitizedMessage,
        time: new Date().toLocaleTimeString(),
      };
      io.emit("chatMessage", chatData);
    }
  });

  // Handle player joining
  socket.on("joinGame", (playerName) => {
    const playerCount = Object.keys(gameState.players).length;
    const startPosition = getPlayerStartPosition(playerCount);

    const player = {
      id: socket.id,
      name: playerName,
      position: { ...startPosition }, // Clone the position object
      color: getRandomColor(),
      bombsAvailable: 1,
      bombRadius: EXPLOSION_RADIUS,
      alive: true,
      score: 0,
      lives: 3, // <-- Add this line
    };

    gameState.players[socket.id] = player;
    console.log(
      `Player ${playerName} joined the game at position:`,
      startPosition
    );

    // Send player data to the client
    socket.emit("joinedGame", player);

    // Start game if we have at least 2 players
    if (Object.keys(gameState.players).length >= 2 && !gameState.gameActive) {
      setTimeout(startNewGame, 3000);
    } else if (!gameState.gameActive) {
      // Initialize board if it's the first player
      if (!gameState.board.length) {
        gameState.board = initializeBoard();
      }
      // Send current game state
      io.emit("gameState", sanitizeGameState(gameState));
    } else {
      // Game is already active, send current state
      socket.emit("gameState", sanitizeGameState(gameState));
    }
  });

  // Update other event handlers to use sanitizeGameState
  socket.on("move", (direction) => {
    if (!gameState.gameActive || !gameState.players[socket.id]) return;

    const player = gameState.players[socket.id];
    if (!player.alive) return;

    const { x, y } = player.position;
    let newX = x;
    let newY = y;

    // Calculate new position
    switch (direction) {
      case "up":
        newY--;
        break;
      case "down":
        newY++;
        break;
      case "left":
        newX--;
        break;
      case "right":
        newX++;
        break;
    }

    // Check if valid move (not a wall or block)
    if (
      newX >= 0 &&
      newX < BOARD_WIDTH &&
      newY >= 0 &&
      newY < BOARD_HEIGHT &&
      gameState.board[newY][newX] !== 1 && // Not a solid wall
      gameState.board[newY][newX] !== 2 // Not a destructible block
    ) {
      // Update player position
      player.position = { x: newX, y: newY };

      // Check for power-ups
      collectPowerUp(player);

      // Send updated game state to all clients
      io.emit("gameState", sanitizeGameState(gameState));
    }
  });

  socket.on("placeBomb", () => {
    if (gameState.gameActive && gameState.players[socket.id]) {
      placeBomb(socket.id);
      io.emit("gameState", sanitizeGameState(gameState));
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Remove player from game
    if (gameState.players[socket.id]) {
      delete gameState.players[socket.id];
      io.emit("gameState", sanitizeGameState(gameState));

      // Check if game should continue
      if (Object.keys(gameState.players).length < 2 && gameState.gameActive) {
        console.log("Not enough players, ending game");
        endGame();
      }
    }
  });
});

// Initialize game state
gameState.board = initializeBoard();

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
