# Supabase Storage: RLS для бакета healis-files

Ошибка `new row violates row-level security policy` означает, что в бакете включён RLS и нет политики, разрешающей загрузку.

Выполните в **Supabase Dashboard → SQL Editor** один из вариантов.

## Вариант 1: загрузка для анонимных запросов (ANON KEY с фронта)

Если фронт использует `REACT_APP_SUPABASE_ANON_KEY` и пользователи не логинятся через Supabase Auth:

```sql
-- Разрешить загрузку в бакет healis-files для роли anon
CREATE POLICY "Allow anon upload healis-files"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'healis-files');

-- Разрешить чтение (публичные ссылки на файлы)
CREATE POLICY "Allow anon read healis-files"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'healis-files');
```

## Вариант 2: только для авторизованных в Supabase

Если вы используете Supabase Auth (логин через Supabase):

```sql
CREATE POLICY "Allow authenticated upload healis-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'healis-files');

CREATE POLICY "Allow authenticated read healis-files"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'healis-files');
```

После сохранения политик загрузка файлов должна проходить без ошибки RLS.

---

## Переменные окружения (Vercel / мобильный фронт)

Чтобы загрузка с телефона и с продакшена работала, на фронте должны быть заданы:

- `REACT_APP_SUPABASE_URL` — URL проекта (например `https://xxxx.supabase.co`)
- `REACT_APP_SUPABASE_ANON_KEY` — публичный anon key

В **Vercel** их задают в Project → Settings → Environment Variables и пересобирают деплой.

Без этих переменных в консоли будет предупреждение «Supabase is not configured» и загрузка не сработает.

## CORS для Storage (если запросы блокируются)

Запросы в Storage идут с домена приложения (например `https://your-app.vercel.app`). Если в браузере видите CORS-ошибку при загрузке:

1. **Supabase Dashboard** → **Project Settings** → **API**
2. В блоке **CORS** добавьте ваш домен (например `https://your-app.vercel.app` или `https://*.vercel.app` при необходимости).

Обычно для стандартных доменов Supabase уже разрешает запросы; настраивать CORS нужно только при появлении соответствующей ошибки в консоли.
