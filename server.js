const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const seed = {
      users: [
        { id: 'u1', username: 'demo', password: 'demo', name: 'Demo User', online: true, avatarColor: '#5b8cff', bio: 'Буду на связи' },
        { id: 'u2', username: 'alina', password: 'demo', name: 'Alina', online: true, avatarColor: '#44c4a1', bio: 'В сети' },
        { id: 'u3', username: 'max', password: 'demo', name: 'Max', online: false, avatarColor: '#ff8a5b', bio: 'Занят' }
      ],
      chats: [
        {
          id: 'c1',
          members: ['u1', 'u2'],
          messages: [
            { id: 'm1', senderId: 'u2', type: 'text', text: 'Привет 👋', createdAt: Date.now() - 1000 * 60 * 55 },
            { id: 'm2', senderId: 'u1', type: 'text', text: 'Готово, теперь это мобильная версия 😎', createdAt: Date.now() - 1000 * 60 * 50 },
            { id: 'm3', senderId: 'u2', type: 'image', image: sampleImage(), createdAt: Date.now() - 1000 * 60 * 48 },
            { id: 'm4', senderId: 'u1', type: 'voice', audio: sampleAudio(), duration: '0:03', createdAt: Date.now() - 1000 * 60 * 45 }
          ]
        },
        {
          id: 'c2',
          members: ['u1', 'u3'],
          messages: [
            { id: 'm5', senderId: 'u3', type: 'text', text: 'Проверим как выглядит на телефоне?', createdAt: Date.now() - 1000 * 60 * 120 },
            { id: 'm6', senderId: 'u1', type: 'text', text: 'Да, интерфейс уже под iPhone/Android.', createdAt: Date.now() - 1000 * 60 * 110 }
          ]
        }
      ]
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function sampleImage() {
  return 'data:image/svg+xml;base64,' + Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#6aa9ff" offset="0"/>
          <stop stop-color="#7ef0c3" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="480" height="300" rx="24" fill="url(#g)"/>
      <circle cx="120" cy="90" r="32" fill="rgba(255,255,255,.8)"/>
      <path d="M0 230 C90 150, 170 280, 260 210 S420 150, 480 220 V300 H0 Z" fill="rgba(255,255,255,.45)"/>
      <text x="36" y="260" font-family="Arial" font-size="28" fill="#08304d">Фото в чате</text>
    </svg>
  `).toString('base64');
}

function sampleAudio() {
  return 'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YTAAAAAA';
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
  user.online = true;
  writeDb(db);
  res.json({ user: safeUser(user) });
});

app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body || {};
  const db = readDb();
  if (!username || !password || !name) return res.status(400).json({ error: 'Заполни все поля' });
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Такой username уже занят' });
  }
  const colors = ['#5b8cff', '#44c4a1', '#ff8a5b', '#c26bff', '#ff5fa2'];
  const user = {
    id: 'u' + Date.now(),
    username,
    password,
    name,
    online: true,
    avatarColor: colors[db.users.length % colors.length],
    bio: 'Новый пользователь'
  };
  db.users.push(user);
  writeDb(db);
  res.json({ user: safeUser(user) });
});

app.get('/api/bootstrap', (req, res) => {
  const userId = req.query.userId;
  const db = readDb();
  const users = db.users.map(safeUser);
  const chats = db.chats
    .filter(chat => chat.members.includes(userId))
    .map(chat => ({
      ...chat,
      unread: chat.messages.filter(m => m.senderId !== userId).length % 3,
      typing: Math.random() > 0.65 ? chat.members.find(id => id !== userId) : null
    }));
  res.json({ users, chats });
});

app.post('/api/message', (req, res) => {
  const { chatId, senderId, type, text, image, audio, duration } = req.body || {};
  const db = readDb();
  const chat = db.chats.find(c => c.id === chatId);
  if (!chat) return res.status(404).json({ error: 'Чат не найден' });
  const message = {
    id: 'm' + Date.now(),
    senderId,
    type: type || 'text',
    text: text || '',
    image: image || null,
    audio: audio || null,
    duration: duration || null,
    createdAt: Date.now()
  };
  chat.messages.push(message);
  writeDb(db);
  res.json({ ok: true, message });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  ensureDb();
  console.log(`Mobile messenger running on http://localhost:${PORT}`);
});
