const socket = io();
let myName = '';
let myRoom = '';
let isHost = false;
let timerInterval;
let playerStats = {
  gamesPlayed: 0,
  imposterWins: 0,
  detectiveWins: 0,
  achievements: []
};
let avatarColor = '#4361ee';
let avatarInitials = 'AA';

// Initialize game
document.addEventListener('DOMContentLoaded', () => {
  loadPlayerStats();
  updateStatsDisplay();
  
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  
  // Avatar color picker
  document.getElementById('avatar-color').addEventListener('input', (e) => {
    avatarColor = e.target.value;
    document.getElementById('avatar-preview').style.backgroundColor = avatarColor;
    savePlayerData();
  });
  
  // Emoji reactions
  document.querySelectorAll('.emoji-reaction').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      socket.emit('emojiReaction', emoji);
    });
  });
  
  // Custom questions
  document.getElementById('addCustomQuestion').addEventListener('click', () => {
    const real = document.getElementById('customQuestionReal').value.trim();
    const fake = document.getElementById('customQuestionFake').value.trim();
    
    if (real && fake) {
      socket.emit('submitCustomQuestion', { real, fake });
      document.getElementById('customQuestionReal').value = '';
      document.getElementById('customQuestionFake').value = '';
    }
  });
});

// Game event handlers
document.getElementById('joinBtn').onclick = () => {
  myName = document.getElementById('playerName').value.trim();
  myRoom = document.getElementById('roomCode').value.trim().toUpperCase();
  avatarInitials = getInitials(myName);
  
  if (myName && myRoom) {
    savePlayerData();
    socket.emit('joinRoom', { 
      name: myName, 
      room: myRoom,
      avatarColor,
      avatarInitials
    });
  }
};

document.getElementById('createBtn').onclick = () => {
  myName = document.getElementById('playerName').value.trim();
  avatarInitials = getInitials(myName);
  
  if (myName) {
    savePlayerData();
    socket.emit('createRoom', { 
      name: myName,
      avatarColor,
      avatarInitials
    });
  }
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
    playSound('click');
  } else {
    alert("Please enter an answer!");
  }
};

// Submit discussion message handler
document.getElementById('submitDiscussion').onclick = () => {
  const msg = document.getElementById('discussionInput').value.trim();
  if (msg) {
    socket.emit('discussionMessage', msg);
    document.getElementById('discussionInput').value = '';
    playSound('message');
  } else {
    alert("Please enter a message!");
  }
};

// Enter key support for discussion messages
document.getElementById('discussionInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('submitDiscussion').click();
  }
});

document.getElementById('submitVote').onclick = () => {
  const selected = document.querySelector('input[name="vote"]:checked');
  if (selected) {
    socket.emit('submitVote', selected.value);
    document.getElementById('submitVote').disabled = true;
    playSound('vote');
  } else {
    alert("Please select a player!");
  }
};

document.getElementById('restartGame').onclick = () => {
  socket.emit('restartGame');
  playSound('start');
};

// Floating scoreboard toggle
document.getElementById('toggle-scoreboard').addEventListener('click', () => {
  const scoreboard = document.getElementById('floating-scoreboard');
  scoreboard.style.display = scoreboard.style.display === 'none' ? 'block' : 'none';
});

// Socket event handlers
socket.on('roomJoined', ({ room, players, host }) => {
  document.getElementById('join-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  document.getElementById('roomDisplay').textContent = room;
  isHost = host === socket.id;
  
  if (isHost) {
    document.getElementById('hostControls').classList.remove('hidden');
    document.getElementById('custom-questions-container').classList.remove('hidden');
  }
  
  updatePlayerList(players);
});

socket.on('updatePlayers', players => {
  updatePlayerList(players);
});

socket.on('gameStarted', () => {
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('game-over-screen').classList.add('hidden');
  document.getElementById('floating-scoreboard').style.display = 'block';
  playSound('start');
});

socket.on('roundStart', ({ round, question, time, isImposter }) => {
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
  
  // Show role indicator
  if (isImposter) {
    showNotification("You are the IMPOSTER this round!", "danger");
  } else {
    showNotification("You are telling the TRUTH this round!", "success");
  }
});

socket.on('revealAnswers', ({ question, answers }) => {
  document.getElementById('displayQuestion').textContent = question;
  const tbody = document.getElementById('answersBody');
  tbody.innerHTML = '';
  
  answers.forEach(ans => {
    const row = document.createElement('tr');
    const avatar = createAvatarElement(ans.name, ans.avatarColor, ans.avatarInitials);
    const avatarCell = document.createElement('td');
    avatarCell.appendChild(avatar);
    
    row.appendChild(avatarCell);
    row.innerHTML += `<td>${ans.answer}</td>`;
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

socket.on('newDiscussionMessage', ({ name, message, avatarColor, avatarInitials }) => {
  const box = document.getElementById('discussionMessages');
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  msgDiv.classList.add(name === myName ? 'self' : 'other');
  
  const avatar = createAvatarElement(name, avatarColor, avatarInitials);
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.textContent = `${name}: ${message}`;
  
  msgDiv.appendChild(avatar);
  msgDiv.appendChild(contentDiv);
  box.appendChild(msgDiv);
  box.scrollTop = box.scrollHeight;
  
  if (name !== myName) {
    playSound('message');
  }
});

socket.on('newEmojiReaction', ({ name, emoji, avatarColor, avatarInitials }) => {
  const box = document.getElementById('discussionMessages');
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  msgDiv.classList.add(name === myName ? 'self' : 'other');
  
  const avatar = createAvatarElement(name, avatarColor, avatarInitials);
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.textContent = `${name} reacted: ${emoji}`;
  
  msgDiv.appendChild(avatar);
  msgDiv.appendChild(contentDiv);
  box.appendChild(msgDiv);
  box.scrollTop = box.scrollHeight;
  
  if (name !== myName) {
    playSound('reaction');
  }
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
    
    const avatar = createAvatarElement(p.name, p.avatarColor, p.avatarInitials);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameSpan.style.marginTop = '5px';
    
    label.innerHTML = `
      <input type="radio" name="vote" value="${p.id}" style="display: none;"/>
    `;
    
    label.appendChild(avatar);
    label.appendChild(nameSpan);
    container.appendChild(label);
    
    // Add click handler to select the vote option
    label.addEventListener('click', () => {
      // Deselect all others
      document.querySelectorAll('.vote-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      // Select this one
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    });
  });
  
  document.getElementById('submitVote').disabled = false;
  startTimer(time);
});

socket.on('showScores', ({ scores, isFinalRound, winner, wasImposter }) => {
  updateScoreboard(scores);
  
  if (wasImposter) {
    if (winner.id === socket.id) {
      playerStats.imposterWins++;
      unlockAchievement('master-deceiver');
    }
  } else {
    if (winner.id === socket.id) {
      playerStats.detectiveWins++;
      unlockAchievement('master-detective');
    }
  }
  
  if (isFinalRound) {
    // Show game over screen after delay
    setTimeout(() => {
      playerStats.gamesPlayed++;
      savePlayerStats();
      showGameOverScreen(scores, winner);
    }, 5000);
  }
});

socket.on('newGameStarted', () => {
  document.getElementById('game-over-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('host-restart').classList.add('hidden');
  document.getElementById('floating-scoreboard').style.display = 'block';
});

socket.on('customQuestionAdded', ({ real, fake }) => {
  const list = document.getElementById('custom-questions-list');
  const div = document.createElement('div');
  div.className = 'question-item';
  div.innerHTML = `
    <strong>Real:</strong> ${real}<br>
    <strong>Fake:</strong> ${fake}
  `;
  list.appendChild(div);
});

// Helper functions
function createAvatarElement(name, color, initials) {
  const avatar = document.createElement('div');
  avatar.className = 'player-avatar';
  avatar.style.backgroundColor = color;
  avatar.textContent = initials || getInitials(name);
  avatar.title = name;
  return avatar;
}

function getInitials(name) {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().substring(0, 2);
}

function updatePlayerList(players) {
  const list = document.getElementById('playerList');
  list.innerHTML = '';
  
  players.forEach(p => {
    const li = document.createElement('li');
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    
    const avatar = createAvatarElement(p.name, p.avatarColor, p.avatarInitials);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name + (p.id === socket.id ? " (You)" : "");
    
    playerDiv.appendChild(avatar);
    playerDiv.appendChild(nameSpan);
    li.appendChild(playerDiv);
    
    if (p.id === rooms[myRoom]?.host) {
      const hostBadge = document.createElement('span');
      hostBadge.className = 'player-badge';
      hostBadge.textContent = 'Host';
      li.appendChild(hostBadge);
    }
    
    list.appendChild(li);
  });
}

function updateScoreboard(scores) {
  // Update floating scoreboard
  const floatingBody = document.getElementById('floating-scoreboard-body');
  floatingBody.innerHTML = '';
  
  scores.forEach(p => {
    const floatingRow = document.createElement('tr');
    
    const nameCell = document.createElement('td');
    nameCell.style.display = 'flex';
    nameCell.style.alignItems = 'center';
    nameCell.style.gap = '5px';
    
    const avatar = createAvatarElement(p.name, p.avatarColor, p.avatarInitials);
    avatar.style.width = '20px';
    avatar.style.height = '20px';
    avatar.style.fontSize = '10px';
    
    nameCell.appendChild(avatar);
    nameCell.innerHTML += p.name;
    
    floatingRow.appendChild(nameCell);
    floatingRow.innerHTML += `<td>${p.score}</td>`;
    floatingBody.appendChild(floatingRow);
  });
}

function showGameOverScreen(scores, winner) {
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('game-over-screen').classList.remove('hidden');
  document.getElementById('floating-scoreboard').style.display = 'none';
  
  // Populate final scores
  const tbody = document.getElementById('final-scores');
  tbody.innerHTML = '';
  
  scores.forEach(p => {
    const row = document.createElement('tr');
    
    const nameCell = document.createElement('td');
    nameCell.style.display = 'flex';
    nameCell.style.alignItems = 'center';
    nameCell.style.gap = '5px';
    
    const avatar = createAvatarElement(p.name, p.avatarColor, p.avatarInitials);
    avatar.style.width = '24px';
    avatar.style.height = '24px';
    avatar.style.fontSize = '12px';
    
    nameCell.appendChild(avatar);
    nameCell.innerHTML += p.name;
    
    row.appendChild(nameCell);
    row.innerHTML += `<td>${p.score}</td>`;
    tbody.appendChild(row);
  });
  
  // Show winner
  const winnerBanner = document.getElementById('winnerBanner');
  winnerBanner.textContent = `🏆 Winner: ${winner.name} with ${winner.score} points!`;
  
  // Show confetti
  confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 }
  });
  
  // Play victory sound
  playSound('victory');
  
  // Show restart button for host
  if (isHost) {
    document.getElementById('host-restart').classList.remove('hidden');
  }
  
  // Update stats display
  updateStatsDisplay();
  
  // Unlock first win achievement if applicable
  if (winner.id === socket.id && playerStats.gamesPlayed === 0) {
    unlockAchievement('first-win');
  }
}

function startTimer(seconds) {
  clearInterval(timerInterval);
  const timer = document.getElementById('timeLeft');
  const timerContainer = document.getElementById('timer');
  timerContainer.classList.remove('timer-low');
  
  timer.textContent = seconds;
  
  timerInterval = setInterval(() => {
    seconds--;
    timer.textContent = seconds;
    
    // Add warning style when time is low
    if (seconds <= 10) {
      timerContainer.classList.add('timer-low');
      
      // Play sound at certain intervals
      if (seconds === 10) playSound('warning');
      if (seconds <= 5 && seconds > 0) playSound('tick');
    }
    
    // Disable vote submission when time runs out
    if (seconds <= 0) {
      clearInterval(timerInterval);
      document.getElementById('submitVote').disabled = true;
      playSound('timeup');
    }
  }, 1000);
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const icon = document.querySelector('#theme-toggle i');
  
  if (document.body.classList.contains('dark-mode')) {
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
    localStorage.setItem('theme', 'dark');
  } else {
    icon.classList.remove('fa-sun');
    icon.classList.add('fa-moon');
    localStorage.setItem('theme', 'light');
  }
}

function playSound(type) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let oscillator = audioContext.createOscillator();
  let gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  switch(type) {
    case 'click':
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      break;
    case 'message':
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
      break;
    case 'vote':
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime); // G5
      break;
    case 'start':
      oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
      break;
    case 'warning':
      oscillator.frequency.setValueAtTime(392.00, audioContext.currentTime); // G4
      break;
    case 'tick':
      oscillator.frequency.setValueAtTime(440.00, audioContext.currentTime); // A4
      break;
    case 'timeup':
      oscillator.frequency.setValueAtTime(329.63, audioContext.currentTime); // E4
      break;
    case 'victory':
      // Play a victory tune
      playNote(659.25, 0.1, 0);   // E5
      playNote(783.99, 0.1, 0.1); // G5
      playNote(1046.50, 0.3, 0.2); // C6
      return;
    case 'reaction':
      oscillator.frequency.setValueAtTime(698.46, audioContext.currentTime); // F5
      break;
  }
  
  gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
  
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);
}

function playNote(frequency, duration, delay) {
  setTimeout(() => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let oscillator = audioContext.createOscillator();
    let gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }, delay * 1000);
}

function unlockAchievement(id) {
  if (!playerStats.achievements.includes(id)) {
    playerStats.achievements.push(id);
    savePlayerStats();
    
    const achievementEl = document.getElementById(`achievement-${id}`);
    if (achievementEl) {
      achievementEl.classList.remove('locked');
      showNotification("Achievement Unlocked!", "success");
      playSound('victory');
    }
  }
}

function showNotification(message, type) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Position at top center
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.padding = '10px 20px';
  notification.style.background = type === 'success' ? '#4CAF50' : '#F44336';
  notification.style.color = 'white';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '1000';
  notification.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
  
  document.body.appendChild(notification);
 
  // Remove after delay
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500);
  }, 3000);
}

function savePlayerStats() {
  localStorage.setItem('playerStats', JSON.stringify(playerStats));
  localStorage.setItem('playerData', JSON.stringify({
    name: myName,
    avatarColor,
    avatarInitials
  }));
}

function loadPlayerStats() {
  const stats = localStorage.getItem('playerStats');
  if (stats) {
    playerStats = JSON.parse(stats);
  }
  
  const playerData = localStorage.getItem('playerData');
  if (playerData) {
    const data = JSON.parse(playerData);
    myName = data.name || '';
    avatarColor = data.avatarColor || '#4361ee';
    avatarInitials = data.avatarInitials || getInitials(myName);
    
    document.getElementById('playerName').value = myName;
    document.getElementById('avatar-preview').style.backgroundColor = avatarColor;
    document.getElementById('avatar-color').value = avatarColor;
  }
  
  // Load theme
  const theme = localStorage.getItem('theme');
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.querySelector('#theme-toggle i').classList.remove('fa-moon');
    document.querySelector('#theme-toggle i').classList.add('fa-sun');
  }
}

function updateStatsDisplay() {
  document.getElementById('games-played').textContent = playerStats.gamesPlayed;
  document.getElementById('imposter-wins').textContent = playerStats.imposterWins;
  document.getElementById('detective-wins').textContent = playerStats.detectiveWins;
  
  // Update achievements
  playerStats.achievements.forEach(id => {
    const achievementEl = document.getElementById(`achievement-${id}`);
    if (achievementEl) {
      achievementEl.classList.remove('locked');
    }
  });
}
