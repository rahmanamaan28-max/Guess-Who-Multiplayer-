const socket = io();
let myName = '';
let myRoom = '';
let isHost = false;
let timerInterval;
let audioContextUnlocked = false;

// Sound effects configuration
const soundEffects = {
  timer: "/sounds/timer.mp3",
  correct: "/sounds/correct.mp3",
  wrong: "/sounds/wrong.mp3",
  start: "/sounds/start.mp3",
  vote: "/sounds/vote.mp3"
};

let isSoundEnabled = true;
let voiceStream = null;
let voiceConnections = {};
let voicePeer = null;
let isMuted = false;

// Unlock audio context on first user interaction
document.addEventListener('click', () => {
  if (!audioContextUnlocked) {
    // Create a silent audio context to unlock audio
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    oscillator.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.001);
    audioContextUnlocked = true;
  }
}, { once: true });

// Sound control button
const soundControl = document.createElement('div');
soundControl.id = 'sound-control';
soundControl.innerHTML = '<i class="fas fa-volume-up"></i>';
soundControl.onclick = () => {
  isSoundEnabled = !isSoundEnabled;
  soundControl.innerHTML = isSoundEnabled 
    ? '<i class="fas fa-volume-up"></i>' 
    : '<i class="fas fa-volume-mute"></i>';
  localStorage.setItem('soundEnabled', isSoundEnabled);
};
document.body.appendChild(soundControl);

// Check sound preference from localStorage
if (localStorage.getItem('soundEnabled') === 'false') {
  isSoundEnabled = false;
  soundControl.innerHTML = '<i class="fas fa-volume-mute"></i>';
}

// Play sound helper function
function playSound(soundType) {
  if (!isSoundEnabled || !audioContextUnlocked) return;
  
  try {
    const audio = new Audio(soundEffects[soundType]);
    audio.play().catch(e => console.log("Sound play failed:", e));
  } catch (e) {
    console.error("Error playing sound:", e);
  }
}

// Voice chat functions
async function startVoiceChat() {
  try {
    document.getElementById('voice-chat-overlay').classList.remove('hidden');
    
    // Initialize SimplePeer for WebRTC
    voicePeer = new SimplePeer({ initiator: true, trickle: false });
    
    // Get user media
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Add our stream to peer connection
    voicePeer.addStream(voiceStream);
    
    // Handle signal data
    voicePeer.on('signal', data => {
      socket.emit('voiceSignal', { signal: data, room: myRoom });
    });
    
    // When we receive a stream
    voicePeer.on('stream', stream => {
      // Create audio element for the remote stream
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play();
      
      // Add to voice connections
      const id = stream.id;
      voiceConnections[id] = { audio, stream };
      updateVoiceParticipants();
    });
    
    // Handle errors
    voicePeer.on('error', err => {
      console.error('Voice chat error:', err);
      document.getElementById('voice-chat-status').textContent = 'Error: ' + err.message;
    });
    
    document.getElementById('voice-chat-status').textContent = 'Connected';
    updateVoiceParticipants();
    
  } catch (err) {
    console.error('Error starting voice chat:', err);
    document.getElementById('voice-chat-status').textContent = 'Error: ' + err.message;
  }
}

function stopVoiceChat() {
  if (voiceStream) {
    voiceStream.getTracks().forEach(track => track.stop());
    voiceStream = null;
  }
  
  if (voicePeer) {
    voicePeer.destroy();
    voicePeer = null;
  }
  
  Object.values(voiceConnections).forEach(conn => {
    if (conn.audio) {
      conn.audio.pause();
      conn.audio.srcObject = null;
    }
  });
  
  voiceConnections = {};
  document.getElementById('voice-chat-overlay').classList.add('hidden');
}

function updateVoiceParticipants() {
  const container = document.getElementById('voice-participants');
  container.innerHTML = '';
  
  // Add yourself
  const you = document.createElement('div');
  you.className = `participant participant-you ${isMuted ? 'participant-muted' : ''}`;
  you.innerHTML = `<i class="fas fa-user"></i> ${myName} (You) ${isMuted ? '<i class="fas fa-microphone-slash"></i>' : ''}`;
  container.appendChild(you);
  
  // Add other participants
  Object.entries(voiceConnections).forEach(([id, conn]) => {
    const participant = document.createElement('div');
    participant.className = 'participant';
    participant.innerHTML = `<i class="fas fa-user"></i> ${id}`;
    container.appendChild(participant);
  });
}

// Voice chat controls
document.getElementById('mute-mic-btn').onclick = () => {
  isMuted = !isMuted;
  if (voiceStream) {
    voiceStream.getAudioTracks()[0].enabled = !isMuted;
  }
  document.getElementById('mute-mic-btn').innerHTML = isMuted 
    ? '<i class="fas fa-microphone-slash"></i> Unmute' 
    : '<i class="fas fa-microphone"></i> Mute';
  updateVoiceParticipants();
};

document.getElementById('leave-voice-btn').onclick = () => {
  stopVoiceChat();
  socket.emit('leaveVoiceChat');
};

// Game event handlers
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

document.getElementById('restartGame').onclick = () => {
  socket.emit('restartGame');
};

// Socket event handlers
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
  playSound('start');
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('game-over-screen').classList.add('hidden');
});

socket.on('roundStart', ({ round, question, time }) => {
  playSound('start');
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
  playSound('timer');
  // Start voice chat when discussion begins
  if (navigator.mediaDevices) {
    socket.emit('startVoiceChat');
  }
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
  playSound('vote');
  // Stop voice chat when voting begins
  stopVoiceChat();
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
  });
  document.getElementById('submitVote').disabled = false;
  startTimer(time);
});

socket.on('showScores', ({ scores, isFinalRound, winner }) => {
  updateScoreboard(scores);
  
  if (isFinalRound) {
    playSound(winner.id === socket.id ? 'correct' : 'wrong');
    // Show game over screen after delay
    setTimeout(() => {
      showGameOverScreen(scores, winner);
    }, 5000);
  } else {
    playSound('correct');
  }
});

socket.on('voiceSignal', ({ signal, senderId }) => {
  if (!voicePeer) return;
  
  // If we're the initiator, create a new peer for this connection
  if (voicePeer.initiator) {
    const newPeer = new SimplePeer({ initiator: false, trickle: false });
    newPeer.addStream(voiceStream);
    
    newPeer.on('signal', data => {
      socket.emit('voiceSignal', { signal: data, room: myRoom, targetId: senderId });
    });
    
    newPeer.on('stream', stream => {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play();
      voiceConnections[senderId] = { audio, stream };
      updateVoiceParticipants();
    });
    
    newPeer.signal(signal);
    voiceConnections[senderId] = { peer: newPeer };
  } else {
    voicePeer.signal(signal);
  }
});

socket.on('voiceChatStarted', () => {
  startVoiceChat();
});

socket.on('playerLeftVoiceChat', playerId => {
  if (voiceConnections[playerId]) {
    if (voiceConnections[playerId].audio) {
      voiceConnections[playerId].audio.pause();
      voiceConnections[playerId].audio.srcObject = null;
    }
    delete voiceConnections[playerId];
    updateVoiceParticipants();
  }
});

socket.on('newGameStarted', () => {
  document.getElementById('game-over-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('host-restart').classList.add('hidden');
});

// Helper functions
function updateScoreboard(scores) {
  const tbody = document.getElementById('scoreboardBody');
  tbody.innerHTML = '';
  scores.forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${p.name}</td><td>${p.score}</td>`;
    tbody.appendChild(row);
  });
}

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
  
  // Play ticking sound in last 5 seconds
  const tickInterval = setInterval(() => {
    if (seconds <= 5 && seconds > 0) {
      playSound('timer');
    }
    if (seconds <= 0) {
      clearInterval(tickInterval);
    }
  }, 1000);
  
  timerInterval = setInterval(() => {
    seconds--;
    timer.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(timerInterval);
      clearInterval(tickInterval);
    }
  }, 1000);
}
