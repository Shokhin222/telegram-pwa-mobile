const state = {
  token: localStorage.getItem('pulse_token') || '',
  me: null,
  users: [],
  messages: [],
  onlineUserIds: [],
  activePeerId: null,
  socket: null,
  mediaRecorder: null,
  recordChunks: [],
  peerConnection: null,
  localStream: null,
  callPeerId: null,
  incomingFrom: null,
  typingTimers: {}
};

const els = {
  authScreen: document.getElementById('authScreen'),
  mainScreen: document.getElementById('mainScreen'),
  authError: document.getElementById('authError'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  chatList: document.getElementById('chatList'),
  searchInput: document.getElementById('searchInput'),
  selfAvatar: document.getElementById('selfAvatar'),
  selfName: document.getElementById('selfName'),
  selfPhone: document.getElementById('selfPhone'),
  avatarInput: document.getElementById('avatarInput'),
  emptyState: document.getElementById('emptyState'),
  chatView: document.getElementById('chatView'),
  peerAvatar: document.getElementById('peerAvatar'),
  peerName: document.getElementById('peerName'),
  peerStatus: document.getElementById('peerStatus'),
  messagesEl: document.getElementById('messagesEl'),
  messageInput: document.getElementById('messageInput'),
  composer: document.getElementById('composer'),
  typingBar: document.getElementById('typingBar'),
  imageInput: document.getElementById('imageInput'),
  recordBtn: document.getElementById('recordBtn'),
  callBtn: document.getElementById('callBtn'),
  callModal: document.getElementById('callModal'),
  callAvatar: document.getElementById('callAvatar'),
  callTitle: document.getElementById('callTitle'),
  callSubtitle: document.getElementById('callSubtitle'),
  acceptCallBtn: document.getElementById('acceptCallBtn'),
  declineCallBtn: document.getElementById('declineCallBtn'),
  remoteAudio: document.getElementById('remoteAudio')
};

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(`${tab.dataset.tab}Form`).classList.add('active');
  els.authError.textContent = '';
}));

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await auth('/api/login', Object.fromEntries(fd.entries()));
});
els.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = await auth('/api/register', Object.fromEntries(fd.entries()));
  if (res?.note) alert(res.note);
});
els.searchInput.addEventListener('input', renderChatList);
els.avatarInput.addEventListener('change', uploadAvatar);
els.imageInput.addEventListener('change', sendImage);
els.composer.addEventListener('submit', sendText);
els.messageInput.addEventListener('input', onTyping);
els.recordBtn.addEventListener('click', toggleRecording);
els.callBtn.addEventListener('click', startCall);
els.acceptCallBtn.addEventListener('click', acceptIncomingCall);
els.declineCallBtn.addEventListener('click', declineOrEndCall);

async function api(url, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

async function auth(url, payload) {
  try {
    const data = await api(url, { method: 'POST', body: JSON.stringify(payload) });
    state.token = data.token;
    localStorage.setItem('pulse_token', state.token);
    await bootstrap();
    return data;
  } catch (err) {
    els.authError.textContent = err.message;
  }
}

function renderAvatar(container, user) {
  container.innerHTML = '';
  container.style.background = `linear-gradient(135deg, ${user.color || '#2563eb'}, #9333ea)`;
  if (user.avatarUrl) {
    const img = document.createElement('img');
    img.src = user.avatarUrl;
    container.appendChild(img);
  } else {
    container.textContent = (user.name || '?').slice(0, 1).toUpperCase();
  }
}

function chatPreview(peer) {
  const list = convoWith(peer.id);
  const last = list[list.length - 1];
  return last ? (last.type === 'text' ? last.text : last.type === 'image' ? '🖼️ Фото' : '🎤 Голосовое') : 'Сообщений пока нет';
}

function unreadCount(peerId) {
  return convoWith(peerId).filter((m) => m.to === state.me.id && m.from === peerId && !(m.readBy || []).includes(state.me.id)).length;
}

function convoWith(peerId) {
  return state.messages.filter((m) => [m.from, m.to].includes(state.me.id) && [m.from, m.to].includes(peerId)).sort((a,b)=>a.createdAt-b.createdAt);
}

function getPeer() { return state.users.find((u) => u.id === state.activePeerId); }

function renderChatList() {
  const q = els.searchInput.value.trim().toLowerCase();
  const peers = state.users.filter((u) => !u.isSelf && (`${u.name} ${u.phone}`).toLowerCase().includes(q));
  peers.sort((a,b) => {
    const at = convoWith(a.id).at(-1)?.createdAt || 0;
    const bt = convoWith(b.id).at(-1)?.createdAt || 0;
    return bt - at;
  });
  els.chatList.innerHTML = '';
  for (const peer of peers) {
    const item = document.createElement('button');
    item.className = `chat-item ${state.activePeerId === peer.id ? 'active' : ''}`;
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    renderAvatar(avatar, peer);
    const unread = unreadCount(peer.id);
    item.innerHTML = `<div class="meta"><div class="top"><strong>${peer.name}</strong><span class="muted">${isOnline(peer.id) ? 'online' : 'offline'}</span></div><div class="snippet">${escapeHtml(chatPreview(peer))}</div></div>${unread ? `<span class="badge">${unread}</span>` : ''}`;
    item.prepend(avatar);
    item.onclick = () => selectChat(peer.id);
    els.chatList.appendChild(item);
  }
}

async function bootstrap() {
  try {
    const data = await api('/api/bootstrap');
    state.me = data.user;
    state.users = data.users;
    state.messages = data.messages;
    state.onlineUserIds = data.onlineUserIds;
    renderSelf();
    renderChatList();
    connectSocket();
    els.authScreen.classList.add('hidden');
    els.mainScreen.classList.remove('hidden');
  } catch {
    localStorage.removeItem('pulse_token');
    state.token = '';
  }
}

function renderSelf() {
  renderAvatar(els.selfAvatar, state.me);
  els.selfName.textContent = state.me.name;
  els.selfPhone.textContent = state.me.phone;
}

function isOnline(userId) { return state.onlineUserIds.includes(userId); }

async function selectChat(peerId) {
  state.activePeerId = peerId;
  renderChatList();
  const peer = getPeer();
  els.emptyState.classList.add('hidden');
  els.chatView.classList.remove('hidden');
  renderAvatar(els.peerAvatar, peer);
  els.peerName.textContent = peer.name;
  els.peerStatus.textContent = isOnline(peer.id) ? 'В сети' : `Был(а) ${fmt(peer.lastSeenAt)}`;
  renderMessages();
  await api('/api/messages/read', { method: 'POST', body: JSON.stringify({ peerId }) });
}

function renderMessages() {
  const peer = getPeer();
  if (!peer) return;
  const messages = convoWith(peer.id);
  els.messagesEl.innerHTML = '';
  for (const m of messages) {
    const div = document.createElement('div');
    div.className = `bubble ${m.from === state.me.id ? 'self' : 'peer'}`;
    let inner = '';
    if (m.type === 'image') inner += `<img src="${m.imageUrl}" alt="image" />`;
    if (m.type === 'audio') inner += `<audio controls src="${m.audioUrl}"></audio>`;
    if (m.text) inner += `<div>${escapeHtml(m.text)}</div>`;
    inner += `<div class="time">${fmt(m.createdAt)}</div>`;
    div.innerHTML = inner;
    els.messagesEl.appendChild(div);
  }
  els.messagesEl.scrollTop = els.messagesEl.scrollHeight;
}

async function sendText(e) {
  e.preventDefault();
  const text = els.messageInput.value.trim();
  if (!text || !state.activePeerId) return;
  await api('/api/messages', { method: 'POST', body: JSON.stringify({ to: state.activePeerId, text }) });
  els.messageInput.value = '';
  onTyping(true);
}

async function sendImage(e) {
  const file = e.target.files[0];
  if (!file || !state.activePeerId) return;
  const fd = new FormData();
  fd.append('image', file);
  fd.append('to', state.activePeerId);
  await api('/api/messages', { method: 'POST', body: fd });
  e.target.value = '';
}

async function uploadAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('avatar', file);
  const data = await api('/api/profile/avatar', { method: 'POST', body: fd });
  state.me = data.user;
  state.users = state.users.map((u) => u.id === state.me.id ? { ...u, ...state.me } : u);
  renderSelf();
  renderChatList();
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = io({ auth: { token: state.token } });
  state.socket.on('message:new', (message) => {
    if (!state.messages.find((m) => m.id === message.id)) state.messages.push(message);
    renderChatList();
    if (state.activePeerId && [message.from, message.to].includes(state.activePeerId)) renderMessages();
  });
  state.socket.on('presence:update', ({ userId, online, lastSeenAt }) => {
    state.onlineUserIds = online ? [...new Set([...state.onlineUserIds, userId])] : state.onlineUserIds.filter((id) => id !== userId);
    state.users = state.users.map((u) => u.id === userId ? { ...u, lastSeenAt: lastSeenAt || u.lastSeenAt } : u);
    renderChatList();
    if (state.activePeerId === userId) {
      const peer = getPeer();
      els.peerStatus.textContent = isOnline(userId) ? 'В сети' : `Был(а) ${fmt(peer.lastSeenAt)}`;
    }
  });
  state.socket.on('typing:update', ({ from, isTyping }) => {
    if (state.activePeerId === from) els.typingBar.textContent = isTyping ? 'Печатает…' : '';
  });
  state.socket.on('user:update', (user) => {
    state.users = state.users.map((u) => u.id === user.id ? { ...u, ...user } : u);
    renderChatList();
    if (state.activePeerId === user.id) renderAvatar(els.peerAvatar, user);
  });
  state.socket.on('call:incoming', ({ from }) => showCallModal(from, true));
  state.socket.on('call:accepted', async ({ from }) => { state.callPeerId = from; els.callSubtitle.textContent = 'Соединение…'; await createOffer(false); });
  state.socket.on('call:declined', () => closeCall('Звонок отклонён'));
  state.socket.on('call:ended', () => closeCall('Звонок завершён'));
  state.socket.on('webrtc:offer', async ({ from, sdp }) => {
    state.callPeerId = from;
    await ensurePeerConnection();
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);
    state.socket.emit('webrtc:answer', { to: from, sdp: answer });
    els.callSubtitle.textContent = 'Соединение установлено';
  });
  state.socket.on('webrtc:answer', async ({ sdp }) => {
    await state.peerConnection?.setRemoteDescription(new RTCSessionDescription(sdp));
    els.callSubtitle.textContent = 'Соединение установлено';
  });
  state.socket.on('webrtc:ice', async ({ candidate }) => {
    try { await state.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  });
}

function onTyping(forceStop = false) {
  if (!state.activePeerId || !state.socket) return;
  const isTyping = forceStop ? false : !!els.messageInput.value.trim();
  state.socket.emit('typing', { to: state.activePeerId, isTyping });
}

async function toggleRecording() {
  if (!navigator.mediaDevices?.getUserMedia) return alert('Браузер не даёт доступ к микрофону.');
  if (state.mediaRecorder?.state === 'recording') {
    state.mediaRecorder.stop();
    els.recordBtn.textContent = '🎤';
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.recordChunks = [];
  state.mediaRecorder = new MediaRecorder(stream);
  state.mediaRecorder.ondataavailable = (e) => state.recordChunks.push(e.data);
  state.mediaRecorder.onstop = async () => {
    const blob = new Blob(state.recordChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = async () => {
      await api('/api/messages', { method: 'POST', body: JSON.stringify({ to: state.activePeerId, audioBase64: reader.result }) });
      stream.getTracks().forEach((t) => t.stop());
    };
    reader.readAsDataURL(blob);
  };
  state.mediaRecorder.start();
  els.recordBtn.textContent = '⏹️';
}

function peerById(id) { return state.users.find((u) => u.id === id); }

function showCallModal(peerId, incoming = false) {
  const peer = peerById(peerId);
  state.incomingFrom = incoming ? peerId : null;
  state.callPeerId = peerId;
  renderAvatar(els.callAvatar, peer);
  els.callTitle.textContent = incoming ? `Входящий звонок: ${peer.name}` : `Звоним: ${peer.name}`;
  els.callSubtitle.textContent = incoming ? 'Нажми принять' : 'Ожидание ответа…';
  els.acceptCallBtn.classList.toggle('hidden', !incoming);
  els.callModal.classList.remove('hidden');
}

async function startCall() {
  if (!state.activePeerId) return;
  showCallModal(state.activePeerId, false);
  state.socket.emit('call:invite', { to: state.activePeerId });
}

async function acceptIncomingCall() {
  const from = state.incomingFrom;
  if (!from) return;
  els.acceptCallBtn.classList.add('hidden');
  els.callSubtitle.textContent = 'Подключаем микрофон…';
  await ensurePeerConnection();
  state.socket.emit('call:accept', { to: from });
}

function declineOrEndCall() {
  if (state.callPeerId && state.socket) state.socket.emit('call:end', { to: state.callPeerId });
  closeCall('Звонок завершён');
}

async function ensurePeerConnection() {
  if (state.peerConnection) return;
  state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
  pc.ontrack = (event) => { els.remoteAudio.srcObject = event.streams[0]; };
  pc.onicecandidate = (event) => {
    if (event.candidate && state.callPeerId) state.socket.emit('webrtc:ice', { to: state.callPeerId, candidate: event.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) closeCall('Соединение потеряно');
  };
  state.peerConnection = pc;
}

async function createOffer(createPc = true) {
  if (createPc) await ensurePeerConnection();
  const offer = await state.peerConnection.createOffer();
  await state.peerConnection.setLocalDescription(offer);
  state.socket.emit('webrtc:offer', { to: state.callPeerId, sdp: offer });
}

function closeCall(text) {
  els.callSubtitle.textContent = text;
  setTimeout(() => els.callModal.classList.add('hidden'), 500);
  state.peerConnection?.close();
  state.peerConnection = null;
  state.localStream?.getTracks().forEach((t) => t.stop());
  state.localStream = null;
  state.callPeerId = null;
  state.incomingFrom = null;
  els.acceptCallBtn.classList.add('hidden');
}

function fmt(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
bootstrap();
