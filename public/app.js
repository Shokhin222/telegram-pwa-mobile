const state = {
  mode: 'login',
  user: null,
  users: [],
  chats: [],
  activeChatId: null,
  tab: 'chats',
  recorder: null,
  recording: false,
  audioChunks: []
};

const app = document.getElementById('app');

function initials(name) {
  return (name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function currentChat() {
  return state.chats.find(c => c.id === state.activeChatId);
}

function chatPeer(chat) {
  const otherId = chat.members.find(id => id !== state.user.id);
  return state.users.find(u => u.id === otherId);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

async function loadData() {
  const data = await api(`/api/bootstrap?userId=${state.user.id}`);
  state.users = data.users;
  state.chats = data.chats.sort((a, b) => (b.messages.at(-1)?.createdAt || 0) - (a.messages.at(-1)?.createdAt || 0));
  if (!state.activeChatId && state.chats[0]) state.activeChatId = state.chats[0].id;
  render();
}

function renderAuth(error = '') {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="logo">✈️</div>
        <h1 class="title">Telegram Mobile Lite</h1>
        <div class="sub center">Открывай на iPhone или Android и добавляй на главный экран</div>
        <div class="switcher">
          <button class="${state.mode === 'login' ? 'active' : ''}" onclick="setMode('login')">Вход</button>
          <button class="${state.mode === 'register' ? 'active' : ''}" onclick="setMode('register')">Регистрация</button>
        </div>
        <div class="form">
          ${state.mode === 'register' ? '<input id="name" class="input" placeholder="Имя" />' : ''}
          <input id="username" class="input" placeholder="Логин" />
          <input id="password" class="input" type="password" placeholder="Пароль" />
          <button class="auth-btn" onclick="submitAuth()">${state.mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
          <div class="error">${error}</div>
          <div class="pill">Демо: demo / demo</div>
        </div>
      </div>
    </div>
  `;
}

function renderHome() {
  const activeTab = state.tab;
  const chatCards = state.chats.map(chat => {
    const peer = chatPeer(chat);
    const last = chat.messages.at(-1);
    const preview = chat.typing === peer?.id ? 'печатает…' : (last?.type === 'image' ? '📷 Фото' : last?.type === 'voice' ? '🎤 Голосовое' : last?.text || 'Пустой чат');
    return `
      <div class="card" onclick="openChat('${chat.id}')">
        <div class="avatar" style="background:${peer?.avatarColor || '#607d8b'}">${initials(peer?.name)}</div>
        <div class="card-body">
          <div class="row">
            <div class="name">${peer?.name || 'Чат'}</div>
            <div class="time">${last ? fmtTime(last.createdAt) : ''}</div>
          </div>
          <div class="row">
            <div class="preview ${chat.typing === peer?.id ? 'typing' : ''}">${preview}</div>
            ${chat.unread ? `<div class="badge">${chat.unread}</div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const contacts = state.users.filter(u => u.id !== state.user.id).map(u => `
    <div class="card" onclick="startChatWith('${u.id}')">
      <div class="avatar" style="background:${u.avatarColor}">${initials(u.name)}</div>
      <div class="card-body">
        <div class="row"><div class="name">${u.name}</div><div class="time">@${u.username}</div></div>
        <div class="preview">${u.online ? 'в сети' : u.bio || 'не в сети'}</div>
      </div>
    </div>
  `).join('');

  app.innerHTML = `
    <div class="mobile-shell">
      <div class="screen ${state.activeChatId ? 'hidden' : ''}">
        <div class="header">
          <div class="header-row">
            <div class="avatar" style="background:${state.user.avatarColor}; width:42px; height:42px;">${initials(state.user.name)}</div>
            <div>
              <div class="brand">Сообщения</div>
              <div class="sub">${state.user.name} · @${state.user.username}</div>
            </div>
          </div>
          <div class="search">
            <span>🔎</span>
            <input placeholder="Поиск" oninput="filterCards(this.value)" />
          </div>
        </div>

        <div class="list view-${activeTab}">
          ${activeTab === 'chats' ? chatCards : activeTab === 'contacts' ? `<div class="contact-list">${contacts}</div>` : activeTab === 'calls' ? `<div class="card"><div class="card-body"><div class="name">Звонки</div><div class="preview">Интерфейс готов. Реальные звонки можно добавить позже через WebRTC.</div></div></div>` : `<div class="card"><div class="card-body"><div class="name">Настройки</div><div class="preview">PWA, тёмная тема, мобильная раскладка, фото и голосовые уже готовы.</div></div></div>`}
        </div>

        <button class="fab" onclick="state.tab='contacts'; render()">✎</button>

        <div class="tabbar">
          <button class="tab ${activeTab === 'contacts' ? 'active' : ''}" onclick="setTab('contacts')">Контакты</button>
          <button class="tab ${activeTab === 'calls' ? 'active' : ''}" onclick="setTab('calls')">Звонки</button>
          <button class="tab ${activeTab === 'chats' ? 'active' : ''}" onclick="setTab('chats')">Чаты</button>
          <button class="tab ${activeTab === 'settings' ? 'active' : ''}" onclick="setTab('settings')">Настройки</button>
        </div>
      </div>
      ${state.activeChatId ? renderChat() : ''}
    </div>
  `;
}

function renderChat() {
  const chat = currentChat();
  if (!chat) return '';
  const peer = chatPeer(chat);
  const messages = chat.messages.map(m => {
    const mine = m.senderId === state.user.id;
    const content = m.type === 'image'
      ? `<div class="bubble"><img src="${m.image}" alt="image" /></div>`
      : m.type === 'voice'
      ? `<div class="bubble"><div class="voice"><span>🎤</span><div class="wave"></div><span>${m.duration || '0:01'}</span></div>${m.audio ? `<audio controls src="${m.audio}" style="width:100%; margin-top:8px"></audio>` : ''}</div>`
      : `<div class="bubble">${escapeHtml(m.text)}</div>`;
    return `<div class="msg ${mine ? 'mine' : ''}">${content}<div class="meta"><span>${fmtTime(m.createdAt)}</span>${mine ? '<span>✓✓</span>' : ''}</div></div>`;
  }).join('');

  return `
    <div class="chat-screen">
      <div class="chat-header">
        <div class="chat-top">
          <button class="back" onclick="closeChat()">←</button>
          <div class="avatar" style="background:${peer?.avatarColor}; width:42px; height:42px;">${initials(peer?.name)}</div>
          <div class="chat-user">
            <div class="name">${peer?.name}</div>
            <div class="sub">${peer?.online ? 'в сети' : peer?.bio || 'был недавно'}</div>
          </div>
          <button class="icon-btn" onclick="alert('Можно добавить звонки через WebRTC')">📞</button>
        </div>
      </div>
      <div class="messages" id="messages">
        <div class="day-sep">Сегодня</div>
        ${messages}
      </div>
      <div class="composer">
        <div class="composer-bar">
          <label class="attach" title="Фото">
            📎
            <input type="file" accept="image/*" hidden onchange="sendImage(event)" />
          </label>
          <textarea id="composerInput" placeholder="Сообщение"></textarea>
          <div class="inline-actions">
            <button class="icon-btn" onclick="toggleRecord()">${state.recording ? '■' : '🎤'}</button>
            <button class="send" onclick="sendText()">➤</button>
          </div>
        </div>
        <div class="micro">Чтобы установить как приложение на iPhone: Safari → Поделиться → На экран «Домой»</div>
      </div>
    </div>
  `;
}

function escapeHtml(value='') {
  return value.replace(/[&<>"']/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]));
}

window.setMode = function(mode) { state.mode = mode; renderAuth(); };
window.setTab = function(tab) { state.tab = tab; render(); };
window.openChat = function(chatId) { state.activeChatId = chatId; render(); setTimeout(scrollBottom, 50); };
window.closeChat = function() { state.activeChatId = null; render(); };
window.filterCards = function(query) {
  query = query.toLowerCase();
  document.querySelectorAll('.card').forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
};
window.startChatWith = function(userId) {
  let chat = state.chats.find(c => c.members.includes(userId) && c.members.includes(state.user.id));
  if (!chat) {
    chat = { id: 'local-' + Date.now(), members: [state.user.id, userId], messages: [], unread: 0 };
    state.chats.unshift(chat);
  }
  state.activeChatId = chat.id;
  state.tab = 'chats';
  render();
};

window.submitAuth = async function() {
  const username = document.getElementById('username')?.value?.trim();
  const password = document.getElementById('password')?.value?.trim();
  const name = document.getElementById('name')?.value?.trim();
  try {
    const endpoint = state.mode === 'login' ? '/api/login' : '/api/register';
    const payload = state.mode === 'login' ? { username, password } : { username, password, name };
    const data = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    state.user = data.user;
    await loadData();
  } catch (e) {
    renderAuth(e.message);
  }
};

window.sendText = async function() {
  const input = document.getElementById('composerInput');
  const text = input.value.trim();
  if (!text) return;
  const chat = currentChat();
  if (chat.id.startsWith('local-')) {
    chat.messages.push({ id: 'm' + Date.now(), senderId: state.user.id, type: 'text', text, createdAt: Date.now() });
  } else {
    const { message } = await api('/api/message', { method: 'POST', body: JSON.stringify({ chatId: chat.id, senderId: state.user.id, type: 'text', text }) });
    chat.messages.push(message);
  }
  input.value = '';
  render();
  scrollBottom();
};

window.sendImage = async function(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const chat = currentChat();
    const payload = { id: 'm' + Date.now(), senderId: state.user.id, type: 'image', image: reader.result, createdAt: Date.now() };
    if (chat.id.startsWith('local-')) chat.messages.push(payload);
    else {
      const { message } = await api('/api/message', { method: 'POST', body: JSON.stringify({ chatId: chat.id, senderId: state.user.id, type: 'image', image: reader.result }) });
      chat.messages.push(message);
    }
    render();
    scrollBottom();
  };
  reader.readAsDataURL(file);
};

window.toggleRecord = async function() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Запись голоса не поддерживается в этом браузере');
    return;
  }
  if (!state.recording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.recorder = new MediaRecorder(stream);
    state.recorder.ondataavailable = e => state.audioChunks.push(e.data);
    state.recorder.onstop = async () => {
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = async () => {
        const audio = reader.result;
        const chat = currentChat();
        const payload = { id: 'm' + Date.now(), senderId: state.user.id, type: 'voice', audio, duration: '0:03', createdAt: Date.now() };
        if (chat.id.startsWith('local-')) chat.messages.push(payload);
        else {
          const { message } = await api('/api/message', { method: 'POST', body: JSON.stringify({ chatId: chat.id, senderId: state.user.id, type: 'voice', audio, duration: '0:03' }) });
          chat.messages.push(message);
        }
        render();
        scrollBottom();
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    state.recorder.start();
    state.recording = true;
    render();
  } else {
    state.recorder.stop();
    state.recording = false;
    render();
  }
};

function scrollBottom() {
  const messages = document.getElementById('messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function render() {
  if (!state.user) return renderAuth();
  renderHome();
  setTimeout(scrollBottom, 30);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

render();
