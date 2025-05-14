const socket = io("http://localhost:3000");

class BombermanGame {
  constructor() {
    this.loginScreen = document.getElementById("login-screen");
    this.gameScreen = document.getElementById("game-screen");
    this.nameInput = document.getElementById("nameInput");
    this.joinBtn = document.getElementById("join-btn");
    this.playersList = document.getElementById("players");
    this.gameStatus = document.getElementById("game-status");
    this.gameBoard = document.getElementById("game-board");
    this.winnerBanner = document.getElementById("winner-banner");
    this.winnerText = document.getElementById("winner-text");
    this.countdownElement = document.getElementById("countdown");
    this.scoreBoard = document.getElementById("score-board");
    this.chatMessages = document.getElementById("chat-messages");
    this.chatInput = document.getElementById("chat-input");
    this.sendMessageBtn = document.getElementById("send-message");
    this.emojiButton = document.getElementById("emoji-button");
    this.emojiPicker = document.getElementById("emoji-picker");

    // Movement buttons
    this.upBtn = document.getElementById("up");
    this.downBtn = document.getElementById("down");
    this.leftBtn = document.getElementById("left");
    this.rightBtn = document.getElementById("right");
    this.bombBtn = document.getElementById("bomb");

    this.playerId = null;
    this.playerName = "";
    this.gameState = null;
    this.isGameActive = false;
    this.cellSize = 40; // Size of each cell in pixels

    this.setupEventListeners();
    this.setupSocketListeners();
    this.setupEmojiPicker();
  }

  setupEmojiPicker() {
    // Toggle emoji picker visibility
    this.emojiButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up
      this.emojiPicker.classList.toggle("visible");
    });

    // Add click handlers for each emoji
    const emojis = this.emojiPicker.querySelectorAll(".emoji");
    emojis.forEach(emoji => {
      emoji.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent event from bubbling up
        const input = this.chatInput;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        input.value = text.substring(0, start) + emoji.textContent + text.substring(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.textContent.length;
        
        this.emojiPicker.classList.remove("visible");
      });
    });

    // Close emoji picker when clicking outside
    document.addEventListener("click", (e) => {
      if (!this.emojiButton.contains(e.target) && 
          !this.emojiPicker.contains(e.target)) {
        this.emojiPicker.classList.remove("visible");
      }
    });
  }

  setupEventListeners() {
    this.joinBtn.addEventListener("click", () => {
      const playerName = this.nameInput.value.trim();
      if (playerName) {
        this.joinGame(playerName);
      }
    });

    this.nameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const playerName = this.nameInput.value.trim();
        if (playerName) {
          this.joinGame(playerName);
        }
      }
    });

    this.upBtn.addEventListener("click", () => this.move("up"));
    this.downBtn.addEventListener("click", () => this.move("down"));
    this.leftBtn.addEventListener("click", () => this.move("left"));
    this.rightBtn.addEventListener("click", () => this.move("right"));
    this.bombBtn.addEventListener("click", () => this.placeBomb());

    document.addEventListener("keydown", (e) => {
      if (!this.isGameActive) return;

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          this.move("up");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          this.move("down");
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          this.move("left");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.move("right");
          break;
        case " ":
        case "b":
        case "B":
          this.placeBomb();
          break;
      }
    });

    // Chat event listeners
    this.sendMessageBtn.addEventListener("click", () => this.sendChatMessage());
    this.chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.sendChatMessage();
      }
    });
  }

  setupSocketListeners() {
    socket.on("connect", () => {
      this.playerId = socket.id;
      console.log("Connected to server with ID:", this.playerId);
    });

    socket.on("joinedGame", (playerData) => {
      console.log("Joined game as player:", playerData);
    });

    socket.on("gameState", (state) => {
      this.gameState = state;
      this.updatePlayersUI();
      this.renderGameBoard();
      this.updateScoreboard();

      if (state.gameActive) {
        this.gameStatus.textContent = "Game in progress. Place bombs to defeat opponents!";
        this.isGameActive = true;
      } else {
        this.gameStatus.textContent = "Waiting for players...";
        this.isGameActive = false;
      }
    });

    socket.on("bombPlaced", (bombData) => {
      this.renderBomb(bombData);
    });

    socket.on("bombExploded", (explosionData) => {
      this.renderExplosion(explosionData);
    });

    socket.on("playerEliminated", (playerData) => {
      if (playerData.id === this.playerId) {
        // You were eliminated
        this.gameStatus.textContent = "You were eliminated! Waiting for round to end...";
      }
    });

    socket.on("gameOver", (winner) => {
      this.isGameActive = false;
      this.winnerText.textContent = `${winner.name} is the last player standing!`;
      this.winnerBanner.style.display = "block";

      let countdown = 10;
      this.countdownElement.textContent = countdown;

      const timer = setInterval(() => {
        countdown--;
        this.countdownElement.textContent = countdown;

        if (countdown <= 0) {
          clearInterval(timer);
          this.winnerBanner.style.display = "none";
        }
      }, 1000);
    });

    socket.on("chatMessage", (chatData) => {
      this.addChatMessage(chatData);
    });
  }

  joinGame(playerName) {
    socket.emit("joinGame", playerName);
    this.playerName = playerName;
    this.loginScreen.style.display = "none";
    this.gameScreen.style.display = "flex";
  }

  move(direction) {
    if (this.isGameActive) {
      socket.emit("move", direction);
    }
  }

  placeBomb() {
    if (this.isGameActive) {
      socket.emit("placeBomb");
    }
  }

  updatePlayersUI() {
    this.playersList.innerHTML = "";
    Object.values(this.gameState.players).forEach((player) => {
      const listItem = document.createElement("li");
      listItem.textContent = `${player.name} ${
        player.id === this.playerId ? "(You)" : ""
      }`;
      listItem.style.color = player.alive ? "black" : "red";
      this.playersList.appendChild(listItem);
    });
  }

  updateScoreboard() {
    this.scoreBoard.innerHTML = "<h3>Score</h3>";
    
    // Sort players by score in descending order
    const players = Object.values(this.gameState.players)
      .sort((a, b) => b.score - a.score);
    
    players.forEach(player => {
      const scoreItem = document.createElement("div");
      scoreItem.classList.add("score-item");
      
      const nameSpan = document.createElement("span");
      nameSpan.textContent = player.name;
      if (player.id === this.playerId) {
        nameSpan.classList.add("current-player");
      }

      // Add lives display
      const livesSpan = document.createElement("span");
      livesSpan.textContent = `❤️ ${player.lives}`;
      livesSpan.style.marginLeft = "8px";
      livesSpan.style.marginRight = "8px";

      const scoreSpan = document.createElement("span");
      scoreSpan.textContent = player.score;
      
      scoreItem.appendChild(nameSpan);
      scoreItem.appendChild(livesSpan);
      scoreItem.appendChild(scoreSpan);
      this.scoreBoard.appendChild(scoreItem);
    });
  }

  renderGameBoard() {
    if (!this.gameState || !this.gameState.board) return;

    const board = this.gameState.board;
    this.gameBoard.style.gridTemplateColumns = `repeat(${board[0].length}, ${this.cellSize}px)`;
    this.gameBoard.innerHTML = "";

    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        const cell = document.createElement("div");
        cell.classList.add("cell");
        cell.dataset.x = x;
        cell.dataset.y = y;

        // Render cell based on type
        const cellType = board[y][x];
        
        if (cellType === 1) {
          // Solid wall
          cell.classList.add("wall");
        } else if (cellType === 2) {
          // Destructible block
          cell.classList.add("block");
        } else if (cellType === 3) {
          // Power-up
          cell.classList.add("power-up");
        } else {
          // Empty path
          cell.classList.add("path");
        }

        this.gameBoard.appendChild(cell);
      }
    }

    // Render players
    this.renderPlayers();
    
    // Render bombs
    this.gameState.bombs.forEach(bomb => {
      this.renderBomb(bomb);
    });
  }

  renderPlayers() {
    Object.values(this.gameState.players).forEach((player) => {
      if (!player.alive) return;
      
      const x = player.position.x;
      const y = player.position.y;
      const cellIndex = y * this.gameState.board[0].length + x;
      const cell = this.gameBoard.children[cellIndex];

      if (cell) {
        const playerMarker = document.createElement("div");
        playerMarker.classList.add("player");
        playerMarker.style.backgroundColor = player.color;
        playerMarker.style.width = `${this.cellSize - 10}px`;
        playerMarker.style.height = `${this.cellSize - 10}px`;
        playerMarker.title = player.name;

        if (player.id === this.playerId) {
          playerMarker.style.border = "2px solid black";
        }

        // Remove any existing player markers in this cell
        Array.from(cell.children).forEach((child) => {
          if (child.classList.contains("player")) {
            cell.removeChild(child);
          }
        });

        cell.appendChild(playerMarker);
      }
    });
  }

  renderBomb(bomb) {
    const x = bomb.position.x;
    const y = bomb.position.y;
    const cellIndex = y * this.gameState.board[0].length + x;
    const cell = this.gameBoard.children[cellIndex];

    if (cell) {
      // Remove any existing bomb in this cell
      Array.from(cell.children).forEach((child) => {
        if (child.classList.contains("bomb")) {
          cell.removeChild(child);
        }
      });

      const bombElement = document.createElement("div");
      bombElement.classList.add("bomb");
      bombElement.style.width = `${this.cellSize - 15}px`;
      bombElement.style.height = `${this.cellSize - 15}px`;
      
      // Add animation based on timer
      bombElement.style.animation = "pulse 0.5s infinite";
      
      cell.appendChild(bombElement);
    }
  }

  renderExplosion(explosion) {
    // First, render center of explosion
    const centerX = explosion.position.x;
    const centerY = explosion.position.y;
    const centerIndex = centerY * this.gameState.board[0].length + centerX;
    const centerCell = this.gameBoard.children[centerIndex];
    
    if (centerCell) {
      this.addExplosionEffect(centerCell);
    }
    
    // Render explosion arms
    explosion.tiles.forEach(tile => {
      const tileIndex = tile.y * this.gameState.board[0].length + tile.x;
      const tileCell = this.gameBoard.children[tileIndex];
      
      if (tileCell) {
        this.addExplosionEffect(tileCell);
      }
    });
    
    // Remove explosion effects after animation
    setTimeout(() => {
      document.querySelectorAll(".explosion").forEach(el => {
        el.remove();
      });
    }, 1000);
  }
  
  addExplosionEffect(cell) {
    const explosion = document.createElement("div");
    explosion.classList.add("explosion");
    explosion.style.width = `${this.cellSize}px`;
    explosion.style.height = `${this.cellSize}px`;
    
    // Remove any existing explosion in this cell
    Array.from(cell.children).forEach((child) => {
      if (child.classList.contains("explosion")) {
        cell.removeChild(child);
      }
    });
    
    cell.appendChild(explosion);
  }

  sendChatMessage() {
    const message = this.chatInput.value.trim();
    if (message) {
      socket.emit("chatMessage", message);
      this.chatInput.value = "";
    }
  }

  addChatMessage(chatData) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("chat-message");
    
    const senderSpan = document.createElement("span");
    senderSpan.classList.add("sender");
    senderSpan.textContent = chatData.sender;
    
    const timeSpan = document.createElement("span");
    timeSpan.classList.add("time");
    timeSpan.textContent = chatData.time;
    
    const messageText = document.createTextNode(`: ${chatData.message}`);
    
    messageElement.appendChild(senderSpan);
    messageElement.appendChild(timeSpan);
    messageElement.appendChild(messageText);
    
    this.chatMessages.appendChild(messageElement);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new BombermanGame();
});