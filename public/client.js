const socket = io();
let myName = '';
let myRoom = '';
let isHost = false;
let timerInterval;

document.getElementById('joinBtn').onclick = () => {
  myName = document.getElementById('playerName').value.trim();
  myRoom = document.getElementById('roomCode').value.trim().toUpperCase();
  if (myName && myRoom) socket.emit('joinRoom', { name: myName, room: myRoom });
};

document.getElementById('createBtn').onclick = () => {
  myName = document.getElementById('playerName').value.trim();
  if (myName) socket.emit('createRoom', { name: myName });
};

document.getElementById('startGame').onclick = () => {
  const settings = {
    answerTime: +document.getElementById('answerTime').value,
    discussionTime: +document.getElementById('discussionTime').value,
    voteTime: +document.getElementById('voteTime').value,
    rounds: +document.getElementById('rounds').value
  };
  socket.emit('startGame', settings);
};

document.getElementById('submitAnswer').onclick = () => {
  const answer = document.getElementById('answerInput').value.trim();
  if (answer) {
    socket.emit('submitAnswer', answer);
    document.getElementById('answerInput').disabled = true;
    document.getElementById('submitAnswer').disabled = true;
  } else {
    alert("Please enter an answer!");
  }
};

document.getElementById('submitDiscussion').onclick = () => {
  const msg = document.getElementById('discussionInput').value.trim();
  if (msg) {
    socket.emit('discussionMessage', msg);
    document.getElementById('discussionInput').value = '';
  } else {
    alert("Please enter a message!");
  }
};

document.getElementById('submitVote').onclick = () => {
  const selected = document.querySelector('input[name="vote"]:checked');
  if (selected) {
    socket.emit('submitVote', selected.value);
    document.getElementById('submitVote').disabled = true;
  } else {
    alert("Please select a player!");
  }
};

// New restart button handler
document.getElementById('restartGame').onclick = () => {
  socket.emit('restartGame');
};

socket.on('roomJoined', ({ room, players, host }) => {
  document.getElementById('join-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  document.getElementById('roomDisplay').textContent = room;
  isHost = host === socket.id;
  if (isHost) document.getElementById('hostControls').classList.remove('hidden');
  updatePlayerList(players);
});

socket.on('updatePlayers', updatePlayerList);

function updatePlayerList(players) {
  const list = document.getElementById('playerList');
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.id === socket.id ? " (You)" : "");
    list.appendChild(li);
  });
}

socket.on('gameStarted', () => {
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('game-over-screen').classList.add('hidden');
});

socket.on('roundStart', ({ round, question, time }) => {
  document.getElementById('roundNum').textContent = round;
  document.getElementById('displayQuestion').textContent = question;
  
  // Reset UI
  document.getElementById('answer-box').classList.remove('hidden');
  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').disabled = false;
  document.getElementById('submitAnswer').disabled = false;
  document.getElementById('answers-table').classList.add('hidden');
  document.getElementById('vote-box').classList.add('hidden');
  document.getElementById('discussion-box').classList.remove('hidden');
  
  // Clear discussion messages
  document.getElementById('discussionMessages').innerHTML = '';
  
  startTimer(time);
});

socket.on('revealAnswers', ({ question, answers }) => {
  document.getElementById('displayQuestion').textContent = question;
  const tbody = document.getElementById('answersBody');
  tbody.innerHTML = '';
  answers.forEach(ans => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${ans.name}</td><td>${ans.answer}</td>`;
    tbody.appendChild(row);
  });
  document.getElementById('answers-table').classList.remove('hidden');
  document.getElementById('answer-box').classList.add('hidden');
});

socket.on('startDiscussion', ({ time }) => {
  document.getElementById('discussion-box').classList.remove('hidden');
  document.getElementById('vote-box').classList.add('hidden');
  startTimer(time);
});

socket.on('newDiscussionMessage', ({ name, message }) => {
  const box = document.getElementById('discussionMessages');
  const p = document.createElement('p');
  p.textContent = `${name}: ${message}`;
  p.classList.add('message');
  p.classList.add(name === myName ? 'self' : 'other');
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
});

socket.on('startVote', ({ players, time }) => {
  document.getElementById('discussion-box').classList.add('hidden');
  document.getElementById('vote-box').classList.remove('hidden');
  
  const container = document.getElementById('voteOptions');
  container.innerHTML = '';
  players.forEach(p => {
    if (p.id === socket.id) return; // Can't vote for yourself
    
    const label = document.createElement('label');
    label.className = 'vote-option';
    label.innerHTML = `
      <input type="radio" name="vote" value="${p.id}"/>
      ${p.name}
    `;
    container.appendChild(label);
    container.appendChild(document.createElement('br'));
  });
  document.getElementById('submitVote').disabled = false;
  startTimer(time);
});

socket.on('showScores', ({ scores, isFinalRound, winner }) => {
  updateScoreboard(scores);
  
  // Check if it's the final round
  if (isFinalRound) {
    // Show game over screen after delay
    setTimeout(() => {
      showGameOverScreen(scores, winner);
    }, 5000);
  }
});

// Function to update scoreboard
function updateScoreboard(scores) {
  const tbody = document.getElementById('scoreboardBody');
  tbody.innerHTML = '';
  scores.forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${p.name}</td><td>${p.score}</td>`;
    tbody.appendChild(row);
  });
}

// New event for new game started
socket.on('newGameStarted', () => {
  document.getElementById('game-over-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('host-restart').classList.add('hidden');
});

// Function to show game over screen
function showGameOverScreen(scores, winner) {
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('game-over-screen').classList.remove('hidden');
  
  // Populate final scores
  const tbody = document.getElementById('final-scores');
  tbody.innerHTML = '';
  scores.forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${p.name}</td><td>${p.score}</td>`;
    tbody.appendChild(row);
  });
  
  // Show winner
  const winnerBanner = document.getElementById('winnerBanner');
  winnerBanner.textContent = `🏆 Winner: ${winner.name} with ${winner.score} points!`;
  
  // Show restart button for host
  if (isHost) {
    document.getElementById('host-restart').classList.remove('hidden');
  }
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  const timer = document.getElementById('timeLeft');
  timer.textContent = seconds;
  
  timerInterval = setInterval(() => {
    seconds--;
    timer.textContent = seconds;
    if (seconds <= 0) clearInterval(timerInterval);
  }, 1000);
}
