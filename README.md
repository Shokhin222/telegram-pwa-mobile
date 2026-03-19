# Railway Messenger Fixed

Готовый Node.js/PWA-мессенджер для Railway.

## Что исправлено
- запуск на `process.env.PORT`
- bind на `0.0.0.0`
- автосоздание `data/` и `data/uploads/`
- `npm start` для Railway

## Локальный запуск
```powershell
npm.cmd install
npm.cmd start
```

Открыть: `http://localhost:3000`

## Railway
- Build Command: `npm install`
- Start Command: `npm start`
- Port: Railway подхватит автоматически через `process.env.PORT`

## Демо-аккаунты
- `+10000000001 / demo`
- `+10000000002 / demo`
- `+10000000003 / demo`
