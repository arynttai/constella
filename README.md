# Constella

Полноценное веб‑приложение для “умного” формирования команд на хакатоны: **ядра + мосты + баланс навыков**.

## Структура

- `server/` — Node.js backend (REST API + WebSocket + real-time демо‑события)
- `web/` — фронтенд (Vite + TypeScript, визуализация “созвездий” на canvas)

## Запуск (Windows / PowerShell)

### Быстрый старт (рекомендуется)

Из корня репозитория:

```bash
npm install
cd server
npm install
cd ..\web
npm install
```

Дальше:

- **backend**: `cd server` → `npm start`
- **frontend**: `cd web` → `npm run dev`

Откройте `http://localhost:5173`.

### Backend

```bash
cd server
npm start
```

Сервер поднимется на `http://localhost:8787` и WebSocket на `ws://localhost:8787/ws`.

### Frontend

В новом терминале:

```bash
cd web
npm run dev
```

Откройте адрес, который покажет Vite (обычно `http://localhost:5173`).  
Фронтенд проксирует `/api` и `/ws` на сервер.

## Что есть в демо

- **Стратегии**: conservative / experimental / chaotic
- **API**:
  - `GET /api/teams/current` — текущие команды + dataset
  - `POST /api/matching/config` — изменить стратегию/размер команды
  - `POST /api/dataset/demo` — перегенерация демо‑набора
- **WebSocket**:
  - `graph.updated` — события графа
  - `teams.updated` — пересчет команд

## Как читать визуализацию

- **Ядро**: участники с плотными сильными связями (2–3 человека), подсветка “ядро”
- **Bridge**: участники, которые добавлены для разрыва “эхо‑камер” (роль/город/универ/сообщество), подсветка “bridge”
- **Клик по команде**: фокус на созвездии (остальное приглушается)
- **Клик по участнику в списке**: в лог пишется “почему он здесь” (explainability)

