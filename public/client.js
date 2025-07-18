const socket = io();
let myName = '';
let myRoom = '';
let isHost = false;
let timerInterval;

// Voice chat variables
let voiceStream = null;
let voiceConnections = {};
let isMuted = false;

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

document.getElementById('discussionInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('submitDiscussion').click();
  }
});

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

// Floating scoreboard toggle
document.getElementById('toggle-scoreboard').addEventListener('click', () => {
  const scoreboard = document.getElementById('floating-scoreboard');
  scoreboard.style.display = scoreboard.style.display === 'none' ? 'block' : 'none';
});

// Voice chat functions
async function startVoiceChat() {
  try {
    document.getElementById('voice-chat-overlay').classList.remove('hidden');
    document.getElementById('voice-chat-status').textContent = 'Connecting...';
    
    // Get user media
    voiceStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    
    // Request peers from server
    socket.emit('getVoicePeers', myRoom);
    
    document.getElementById('voice-chat-status').textContent = 'Connected';
  } catch (err) {
    console.error('Error starting voice chat:', err);
    document.getElementById('voice-chat-status').textContent = 'Error: ' + err.message;
  }
}

function createPeerConnection(peerId, isInitiator) {
  const peer = new SimplePeer({
    initiator: isInitiator,
    trickle: true,
    stream: voiceStream,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('signal', data => {
    socket.emit('voiceSignal', { 
      signal: data, 
      targetId: peerId,
      room: myRoom 
    });
  });

  peer.on('stream', stream => {
    if (!voiceConnections[peerId]) {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play();
      voiceConnections[peerId] = { audio, peer, stream };
      updateVoiceParticipants();
    }
  });

  peer.on('error', err => {
    console.error('Peer error:', err);
  });

  peer.on('close', () => {
    if (voiceConnections[peerId]) {
      voiceConnections[peerId].audio.pause();
      delete voiceConnections[peerId];
      updateVoiceParticipants();
    }
  });

  return peer;
}

function stopVoiceChat() {
  // Stop local stream
  if (voiceStream) {
    voiceStream.getTracks().forEach(track => track.stop());
    voiceStream = null;
  }

  // Close all peer connections
  Object.values(voiceConnections).forEach(conn => {
    conn.peer.destroy();
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
    participant.className = `participant ${conn.isMuted ? 'participant-muted' : ''}`;
    participant.innerHTML = `<i class="fas fa-user"></i> ${id} ${conn.isMuted ? '<i class="fas fa-microphone-slash"></i>' : ''}`;
    container.appendChild(participant);
  });
}

// Voice chat controls
document.getElementById('mute-mic-btn').onclick = () => {
  isMuted = !isMuted;
  
  if (voiceStream) {
    voiceStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
  }
  
  // Broadcast mute state to others
  socket.emit('muteState', { isMuted, room: myRoom });
  
  // Update button text and icon
  const micBtn = document.getElementById('mute-mic-btn');
  if (isMuted) {
    micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Unmute';
    micBtn.classList.add('danger');
  } else {
    micBtn.innerHTML = '<i class="fas fa-microphone"></i> Mute';
    micBtn.classList.remove('danger');
  }
  
  updateVoiceParticipants();
};

document.getElementById('leave-voice-btn').onclick = () => {
  stopVoiceChat();
  socket.emit('leaveVoiceChat', myRoom);
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

socket.on('updatePlayers', players => {
  updatePlayerList(players);
});

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
  document.getElementById('floating-scoreboard').style.display = 'block';
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
  // Start voice chat when discussion begins
  if (navigator.mediaDevices) {
    startVoiceChat();
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
    // Show game over screen after delay
    setTimeout(() => {
      showGameOverScreen(scores, winner);
    }, 5000);
  }
});

socket.on('voicePeers', (peerIds) => {
  document.getElementById('voice-chat-status').textContent = 'Connected';
  
  peerIds.forEach(peerId => {
    if (!voiceConnections[peerId] && peerId !== socket.id) {
      const isInitiator = socket.id < peerId; // Simple way to decide initiator
      const peer = createPeerConnection(peerId, isInitiator);
      voiceConnections[peerId] = { peer };
    }
  });
});

socket.on('voiceSignal', ({ signal, senderId }) => {
  if (voiceConnections[senderId]) {
    voiceConnections[senderId].peer.signal(signal);
  } else if (senderId !== socket.id) {
    const peer = createPeerConnection(senderId, false);
    peer.signal(signal);
    voiceConnections[senderId] = { peer };
  }
});

socket.on('voiceChatStarted', () => {
  // Not used in this implementation
});

socket.on('newVoicePeer', (peerId) => {
  if (!voiceConnections[peerId] && peerId !== socket.id) {
    const isInitiator = socket.id < peerId;
    const peer = createPeerConnection(peerId, isInitiator);
    voiceConnections[peerId] = { peer };
  }
});

socket.on('playerLeftVoiceChat', playerId => {
  if (voiceConnections[playerId]) {
    voiceConnections[playerId].peer.destroy();
    if (voiceConnections[playerId].audio) {
      voiceConnections[playerId].audio.pause();
      voiceConnections[playerId].audio.srcObject = null;
    }
    delete voiceConnections[playerId];
    updateVoiceParticipants();
  }
});

socket.on('remoteMuteState', ({ playerId, isMuted }) => {
  if (voiceConnections[playerId]) {
    voiceConnections[playerId].isMuted = isMuted;
    updateVoiceParticipants();
  }
});

socket.on('newGameStarted', () => {
  document.getElementById('game-over-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('host-restart').classList.add('hidden');
  document.getElementById('floating-scoreboard').style.display = 'block';
});

// Helper functions
function updateScoreboard(scores) {
  // Update floating scoreboard
  const floatingBody = document.getElementById('floating-scoreboard-body');
  floatingBody.innerHTML = '';
  
  scores.forEach(p => {
    const floatingRow = document.createElement('tr');
    floatingRow.innerHTML = `<td>${p.name}</td><td>${p.score}</td>`;
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
    
    // Disable vote submission when time runs out
    if (seconds <= 0) {
      clearInterval(timerInterval);
      document.getElementById('submitVote').disabled = true;
    }
  }, 1000);
}
