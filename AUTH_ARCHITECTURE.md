# JWT Auth Architecture (Access + Refresh)

## Обзор

Access token (JWT, 5–15 мин) — только в памяти клиента.  
Refresh token — в httpOnly cookie (Secure, SameSite=None для PWA), хранится в Postgres.

## Backend (Express + Postgres)

- **Access token**: JWT, `ACCESS_TOKEN_TTL` (по умолчанию 15m), подпись `JWT_SECRET` или `SECRET_KEY`
- **Refresh token**: `user_id`, `token_hash`, `device_id`, `expires_at` в Postgres; ротация при каждом refresh; защита от reuse (при повторном использовании revoked token — инвалидация всех токенов пользователя)
- **Rate limit**: DB-backed (таблица `rate_limits`), без in-memory state — survives cold start

## Refresh Endpoint (Express)

```js
// POST /api/user/refresh — без тела, refresh берётся из cookie
async refresh(req, res) {
  const raw = req.cookies?.refreshToken;
  if (!raw) return res.status(401).json({ error: 'Not authorized' });

  const tokenHash = hashToken(raw);
  const token = await RefreshToken.findOne({ where: { tokenHash } });
  if (!token) return res.status(401).json({ error: 'Not authorized' });

  // Reuse detection: revoked token reused -> revoke all tokens for user
  if (token.revokedAt) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: token.userId } });
    res.clearCookie('refreshToken', { path: '/api/user' });
    return res.status(401).json({ error: 'Not authorized' });
  }
  if (token.expiresAt && new Date(token.expiresAt) <= Date.now()) return res.status(401).json(...);

  const user = await User.findByPk(token.userId);
  if (!user) return res.status(401).json(...);

  const nextRefresh = await issueRefreshToken({ userId: user.id, req });
  await token.update({ revokedAt: new Date(), replacedByTokenHash: nextRefresh.tokenHash });
  res.cookie('refreshToken', nextRefresh.raw, cookieOptions());

  const access = generateAccessToken(user);
  return res.json({ token: access });
}
```

## Axios Interceptor (Frontend)

```js
let refreshInFlight = null;

axios.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config;
    if (!original || original._retry || isAuthEndpoint(url)) return Promise.reject(error);
    if (status && status >= 500) return Promise.reject(error);  // no logout on 5xx
    if (status !== 401) return Promise.reject(error);

    original._retry = true;
    try {
      if (!refreshInFlight) refreshInFlight = refreshAuth().finally(() => { refreshInFlight = null; });
      await refreshInFlight;
      const token = getToken();
      if (token) { original.headers = original.headers || {}; original.headers.Authorization = `Bearer ${token}`; }
      return axios(original);
    } catch (e) {
      if (e?.response?.status === 401) logout();  // only logout on 401, not on network/5xx
      return Promise.reject(e);
    }
  }
);
```

## Причины слётов auth и как устранены

| Причина | Решение |
|---------|---------|
| Cold start / рестарт Render — in-memory state (Map rate limiter) терялся | Rate limit перенесён в Postgres (`rate_limits`) |
| Access token в localStorage — XSS, устаревшие данные после refresh | Access token только в памяти (`let accessToken`) |
| Logout при 5xx или сетевой ошибке | Interceptor: logout только при 401 от `/refresh` |
| Параллельные refresh — race condition | Один `refreshInFlight` promise, остальные ждут |
| Reuse украденного refresh token | При повторном использовании revoked token — инвалидация всех токенов пользователя |
| Кэширование auth в Service Worker | NetworkOnly для `/api/user/login`, `/refresh`, `/logout` |
