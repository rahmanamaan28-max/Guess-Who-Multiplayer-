const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

const questions = JSON.parse(fs.readFileSync('questions.json', 'utf-8'));
const rooms = {};
let customQuestions = [];

function getRandomQuestion(room) {
  if (customQuestions.length > 0) {
    return customQuestions[Math.floor(Math.random() * customQuestions.length)];
  }
  return questions[Math.floor(Math.random() * questions.length)];
}

function getRoom(socket) {
  return [...socket.rooms].find(room => room !== socket.id);
}

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('createRoom', ({ name, avatarColor, avatarInitials }) => {
    const room = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms[room] = {
      host: socket.id,
      players: [],
      scores: {},
      settings: {},
      round: 1,
      customQuestions: []
    };
    socket.join(room);
    rooms[room].players.push({ 
      id: socket.id, 
      name,
      avatarColor,
      avatarInitials
    });
    rooms[room].scores[socket.id] = 0;

    socket.emit('roomJoined', {
      room,
      players: rooms[room].players,
      host: socket.id
    });
  });

  socket.on('joinRoom', ({ name, room, avatarColor, avatarInitials }) => {
    const game = rooms[room];
    if (game) {
      socket.join(room);
      game.players.push({ 
        id: socket.id, 
        name,
        avatarColor,
        avatarInitials
      });
      game.scores[socket.id] = 0;
      socket.emit('roomJoined', {
        room,
        players: game.players,
        host: game.host
      });
      io.to(room).emit('updatePlayers', game.players);
    }
  });

  socket.on('startGame', (settings) => {
    const room = getRoom(socket);
    const game = rooms[room];
    if (!game) return;

    // Reset game state
    game.settings = settings;
    game.round = 1;
    game.scores = {};
    game.players.forEach(p => {
      game.scores[p.id] = 0;
    });
    game.isFinalRound = false;

    io.to(room).emit('gameStarted');
    startRound(room);
  });

  socket.on('submitAnswer', (answer) => {
    const room = getRoom(socket);
    const game = rooms[room];
    const player = game.players.find(p => p.id === socket.id);
    if (!game.answers) game.answers = [];
    game.answers.push({ 
      id: socket.id, 
      name: player.name, 
      answer,
      avatarColor: player.avatarColor,
      avatarInitials: player.avatarInitials
    });
  });

  socket.on('discussionMessage', (msg) => {
    const room = getRoom(socket);
    const game = rooms[room];
    const player = game.players.find(p => p.id === socket.id);
    io.to(room).emit('newDiscussionMessage', { 
      name: player.name, 
      message: msg,
      avatarColor: player.avatarColor,
      avatarInitials: player.avatarInitials
    });
  });

  socket.on('emojiReaction', (emoji) => {
    const room = getRoom(socket);
    const game = rooms[room];
    const player = game.players.find(p => p.id === socket.id);
    io.to(room).emit('newEmojiReaction', { 
      name: player.name, 
      emoji,
      avatarColor: player.avatarColor,
      avatarInitials: player.avatarInitials
    });
  });

  socket.on('submitVote', (votedId) => {
    const room = getRoom(socket);
    const game = rooms[room];
    if (!game.votes) game.votes = {};
    game.votes[socket.id] = votedId;

    // Check if we have all votes
    if (Object.keys(game.votes).length === game.players.length) {
      tallyVotes(game, room);
    }
  });

  socket.on('restartGame', () => {
    const room = getRoom(socket);
    const game = rooms[room];
    
    if (!game || game.host !== socket.id) return;
    
    // Reset game state
    game.scores = {};
    game.players.forEach(p => {
      game.scores[p.id] = 0;
    });
    game.round = 1;
    game.isFinalRound = false;
    
    // Notify clients
    io.to(room).emit('newGameStarted');
    startRound(room);
  });

  socket.on('submitCustomQuestion', ({ real, fake }) => {
    const room = getRoom(socket);
    const game = rooms[room];
    
    if (game && game.host === socket.id) {
      game.customQuestions.push({ real, fake });
      io.to(room).emit('customQuestionAdded', { real, fake });
    }
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket);
    if (room && rooms[room]) {
      // Remove player from room
      rooms[room].players = rooms[room].players.filter(p => p.id !== socket.id);
      
      // If host left, assign new host
      if (rooms[room].host === socket.id && rooms[room].players.length > 0) {
        rooms[room].host = rooms[room].players[0].id;
      }
      
      // Update players
      io.to(room).emit('updatePlayers', rooms[room].players);
      
      // Remove room if empty
      if (rooms[room].players.length === 0) {
        delete rooms[room];
      }
    }
  });

  function tallyVotes(game, room) {
    // Clear any existing vote timeout
    if (game.voteTimeout) {
      clearTimeout(game.voteTimeout);
      game.voteTimeout = null;
    }
    
    const counts = {};
    Object.values(game.votes).forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });
    
    let mostVotedId = null;
    let maxVotes = 0;
    for (const [id, count] of Object.entries(counts)) {
      if (count > maxVotes) {
        mostVotedId = id;
        maxVotes = count;
      }
    }

    const imposterId = game.imposter;
    const imposterCaught = mostVotedId === imposterId;
    const wasImposter = imposterId;
    
    // Award points
    game.players.forEach(p => {
      if (game.votes[p.id] === imposterId) {
        game.scores[p.id] = (game.scores[p.id] || 0) + 1;
      }
    });
    
    if (!imposterCaught) {
      game.scores[imposterId] = (game.scores[imposterId] || 0) + 2;
    }

    // Check if this is the final round
    const isFinalRound = game.round >= game.settings.rounds;
    
    // Find winner for final round
    let winner = { name: '', score: -1, id: '' };
    if (isFinalRound) {
      game.players.forEach(p => {
        if (game.scores[p.id] > winner.score) {
          winner = { name: p.name, score: game.scores[p.id], id: p.id };
        }
      });
    }
    
    io.to(room).emit('showScores', {
      scores: game.players.map(p => ({ 
        name: p.name, 
        score: game.scores[p.id] || 0,
        avatarColor: p.avatarColor,
        avatarInitials: p.avatarInitials
      })),
      isFinalRound,
      winner,
      wasImposter
    });
    
    game.round++;
    
    // Start next round only if not final
    if (!isFinalRound) {
      setTimeout(() => startRound(room), 5000);
    }
  }
});

function startRound(room) {
  const game = rooms[room];
  const question = getRandomQuestion(room);
  game.currentQuestion = question;
  game.answers = [];
  game.votes = {};
  game.voteTimeout = null; // Reset vote timeout

  const imposterIndex = Math.floor(Math.random() * game.players.length);
  game.imposter = game.players[imposterIndex].id;

  game.players.forEach(p => {
    const q = p.id === game.imposter ? question.fake : question.real;
    io.to(p.id).emit('roundStart', {
      round: game.round,
      question: q,
      time: game.settings.answerTime,
      isImposter: p.id === game.imposter
    });
  });

  // Answer phase timeout
  setTimeout(() => {
    io.to(room).emit('revealAnswers', {
      question: question.real,
      answers: game.answers
    });

    // After 3 sec → discussion
    setTimeout(() => {
      io.to(room).emit('startDiscussion', {
        time: game.settings.discussionTime
      });

      // Discussion phase timeout
      setTimeout(() => {
        io.to(room).emit('startVote', {
          players: game.players,
          time: game.settings.voteTime
        });

        // Set timeout to automatically tally votes
        game.voteTimeout = setTimeout(() => {
          // Always tally votes, even if not all votes are in
          if (Object.keys(game.votes || {}).length > 0) {
            tallyVotes(game, room);
          } else {
            // Skip to next round if no votes
            game.round++;
            if (game.round <= game.settings.rounds) {
              startRound(room);
            } else {
              // Handle final round with no votes
              const winner = { name: 'No one', score: 0, id: null };
              io.to(room).emit('showScores', {
                scores: game.players.map(p => ({
                  name: p.name,
                  score: game.scores[p.id] || 0,
                  avatarColor: p.avatarColor,
                  avatarInitials: p.avatarInitials
                })),
                isFinalRound: true,
                winner
              });
            }
          }
        }, game.settings.voteTime * 1000);

      }, game.settings.discussionTime * 1000);

    }, 3000);

  }, game.settings.answerTime * 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
