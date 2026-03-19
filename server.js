const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'db.json');

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultDb() {
  return {
    users: [
      { id: 'u1', phone: '+10000000001', password: 'demo', name: 'Demo', avatar: '', telegram: '', lastSeen: Date.now() },
      { id: 'u2', phone: '+10000000002', password: 'demo', name: 'Alina', avatar: '', telegram: '', lastSeen: Date.now() },
      { id: 'u3', phone: '+10000000003', password: 'demo', name: 'Max', avatar: '', telegram: '', lastSeen: Date.now() }
    ],
    messages: [
      { id: 'm1', from: 'u2', to: 'u1', text: 'Привет. Это тестовый чат 👋', type: 'text', createdAt: Date.now() - 600000 },
      { id: 'm2', from: 'u1', to: 'u2', text: 'Работает. Уже лучше выглядит.', type: 'text', createdAt: Date.now() - 500000 }
    ]
  };
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function publicUser(u) {
  return { id: u.id, phone: u.phone, name: u.name, avatar: u.avatar, telegram: u.telegram, lastSeen: u.lastSeen || null };
}

function convKey(a, b) {
  return [a, b].sort().join(':');
}

ensureDb();

app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

app.get('/api/health', (_req, res) => res.json({ ok: true, port: PORT }));

app.post('/api/register', (req, res) => {
  const { phone, password, name, telegram } = req.body || {};
  if (!phone || !password || !name) return res.status(400).json({ error: 'Заполни номер, имя и пароль' });
  const db = readDb();
  if (db.users.find(u => u.phone === phone)) return res.status(400).json({ error: 'Этот номер уже зарегистрирован' });
  const user = { id: `u${Date.now()}`, phone, password, name, telegram: telegram || '', avatar: '', lastSeen: Date.now() };
  db.users.push(user);
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.phone === phone && u.password === password);
  if (!user) return res.status(401).json({ error: 'Неверный номер или пароль' });
  user.lastSeen = Date.now();
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.get('/api/bootstrap/:userId', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({
    me: publicUser(user),
    users: db.users.filter(u => u.id !== user.id).map(publicUser),
    messages: db.messages.filter(m => m.from === user.id || m.to === user.id)
  });
});

app.post('/api/avatar/:userId', upload.single('avatar'), (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.userId);
  if (!user || !req.file) return res.status(400).json({ error: 'Не удалось загрузить аватар' });
  user.avatar = `/uploads/${req.file.filename}`;
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.post('/api/upload/:userId', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });
  const mime = req.file.mimetype || '';
  const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'file';
  res.json({ url: `/uploads/${req.file.filename}`, kind, name: req.file.originalname });
});

const onlineUsers = new Map();
const activeCalls = new Map();

io.on('connection', socket => {
  socket.on('auth', ({ userId }) => {
    if (!userId) return;
    socket.data.userId = userId;
    onlineUsers.set(userId, socket.id);
    io.emit('presence', { userId, online: true });
  });

  socket.on('typing', payload => {
    const targetSocket = onlineUsers.get(payload.to);
    if (targetSocket) io.to(targetSocket).emit('typing', { from: payload.from, isTyping: payload.isTyping });
  });

  socket.on('message', msg => {
    const db = readDb();
    const message = { ...msg, id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
    db.messages.push(message);
    writeDb(db);
    const targets = [onlineUsers.get(message.to), onlineUsers.get(message.from)].filter(Boolean);
    targets.forEach(id => io.to(id).emit('message', message));
  });

  socket.on('call:start', ({ from, to, name }) => {
    const targetSocket = onlineUsers.get(to);
    if (!targetSocket) {
      socket.emit('call:unavailable', { to });
      return;
    }
    activeCalls.set(convKey(from, to), true);
    io.to(targetSocket).emit('call:incoming', { from, name });
  });

  socket.on('call:signal', ({ to, data, type, from }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) io.to(targetSocket).emit('call:signal', { from, type, data });
  });

  socket.on('call:end', ({ from, to }) => {
    activeCalls.delete(convKey(from, to));
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) io.to(targetSocket).emit('call:end', { from });
  });

  socket.on('disconnect', () => {
    const { userId } = socket.data;
    if (userId) {
      onlineUsers.delete(userId);
      io.emit('presence', { userId, online: false });
      const db = readDb();
      const user = db.users.find(u => u.id === userId);
      if (user) {
        user.lastSeen = Date.now();
        writeDb(db);
      }
    }
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
