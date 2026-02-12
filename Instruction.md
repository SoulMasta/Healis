REQUEST REACHED EXPRESS
[REQUEST] {
[CORS BEFORE] origin: undefined | allowedOrigins: [
  method: 'GET',
  'https://healis111.vercel.app',
  url: '/api/health/live',
  /^https:\/\/(healis|healis-[\w\-.]+)\.vercel\.app$/
  headers: {
] | envOrigins: [ 'https://healis111.vercel.app' ]
    host: 'healthcheck.railway.app',
    'user-agent': 'RailwayHealthCheck/1.0',
[CORS AFTER] origin: undefined | allowed: true
    'accept-encoding': 'gzip',
[CORS AFTER] response headers: [Object: null prototype] {
    connection: 'close'
  'x-powered-by': 'Express',
  },
  origin: undefined,
  vary: 'Origin',
  'access-control-allow-credentials': 'true',
  'content-type': 'application/json; charset=utf-8',
  'content-length': '11',
  etag: 'W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"'
}
  timestamp: '2026-02-12T12:32:22.001Z'
}

---
## 401 на деплое (Vercel + Railway)

**Manifest 401:** Если manifest.json и другие статичные запросы к домену Vercel возвращают 401 — это Vercel Deployment Protection. Решение: Vercel Dashboard → Project → Settings → Deployment Protection → отключить или открыть доступ для нужного домена.

**Refresh 401:** Для гостей (без логина) запрос POST /api/user/refresh вызывался при каждой загрузке и возвращал 401 (нет cookie). Теперь refresh при старте и по таймеру вызывается только при наличии флага сессии (устанавливается при login/registration/google, сбрасывается при logout), чтобы не слать лишние запросы и не получать 401 в консоли.

