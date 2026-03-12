# API — спецификация и примеры

Версия API: v1 (рекомендуется версионировать пути, например `/api/v1/...`)

Формат: JSON. Код ошибки и сообщение — в стандартном теле ответа.

Пример успешного ответа:

```json
{ "success": true, "data": { ... } }
```

Пример ошибки:

```json
{ "success": false, "error": { "code": 400, "message": "Invalid request" } }
```

## Аутентификация

- POST /api/v1/auth/ssologin — endpoint для обмена кодом/токеном SSO (redirect flow).
- POST /api/v1/auth/refresh — обновление JWT (если реализовано).
- POST /api/v1/auth/logout — разлогин пользователя (ревокация токенов/удаление сессии).

Заголовки: Authorization: Bearer <token>

## Пользователи

- GET /api/v1/users/me — информация о текущем пользователе.
- GET /api/v1/users/:id — информация о пользователе (admin/teacher права).
- PUT /api/v1/users/:id — обновление профиля (ограничено правами).

## Workspaces / Boards

- GET /api/v1/workspaces — список рабочих пространств пользователя.
- POST /api/v1/workspaces — создание рабочего пространства.
- GET /api/v1/workspaces/:id — детали workspace.
- DELETE /api/v1/workspaces/:id — удаление (право владельца/админа).

- GET /api/v1/workspaces/:id/boards — список досок в workspace.
- POST /api/v1/boards — создать доску (или POST /workspaces/:id/boards).
- GET /api/v1/boards/:id — получить состояние доски.
- PUT /api/v1/boards/:id — обновить метаданные доски.

## Stickers / Notes

- POST /api/v1/boards/:boardId/stickers — создать стикер (payload: type, content, position, attachments).
- PUT /api/v1/stickers/:id — обновить стикер.
- DELETE /api/v1/stickers/:id — удалить стикер.
- GET /api/v1/boards/:boardId/stickers — получить список стикеров на доске.

Payload пример:

```json
{
  "type": "text",
  "content": { "text": "Заметка" },
  "position": { "x": 100, "y": 200, "w": 200, "h": 120 }
}
```

## Комментарии и реакции

- POST /api/v1/stickers/:stickerId/comments — добавить комментарий.
- GET /api/v1/stickers/:stickerId/comments — получить комментарии.
- POST /api/v1/comments/:commentId/reactions — добавить реакцию.

## Материалы и файлы

- GET /api/v1/materials — список материалов.
- POST /api/v1/materials — загрузка/регистрация материала (multipart/form-data или предварительный signed URL для S3).
- GET /api/v1/materials/:id — метаданные материала.
- DELETE /api/v1/materials/:id — удаление (права).

## Расписание и события

- GET /api/v1/schedule — расписание пользователя (параметры: week, date, groupId).
- GET /api/v1/events — события календаря.
- POST /api/v1/events — создать событие (workspace scope).

## Загрузка файлов

- POST /api/v1/uploads — endpoint для загрузки файлов; возвращает URL и метаданные.
- Валидация: типы, максимальный размер, сканирование на вредоносный контент при необходимости.

## Real-time (WebSocket)

- Socket.IO namespace: `/boards`
- События:
  - `join` — пользователь присоединяется к комнате доски
  - `sticker:create`, `sticker:update`, `sticker:delete` — синхронизация стикеров
  - `comment:create` — новые комментарии
  - `reaction:update` — обновление реакций

Handshake должен включать JWT для аутентификации:

```js
io.connect(url, { auth: { token: "Bearer <jwt>" } })
```

## Ошибки и коды

- 200 — OK
- 201 — Created
- 400 — Bad Request (валидация)
- 401 — Unauthorized
- 403 — Forbidden
- 404 — Not Found
- 429 — Too Many Requests
- 500 — Internal Server Error

## Версионирование и backward-совместимость

- Версионировать API через URL или заголовки.
- Сохранять старые версии при внесении breaking changes.

## Примечания

- Документировать контракт для каждого endpoint'а (параметры, body, примеры ответов) при подготовке публичной документации разработчика.