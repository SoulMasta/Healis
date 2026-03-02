-- Pilot analytics queries for `user_events` (Postgres)

-- 1) Active users per week (any key learning activity)
SELECT
  date_trunc('week', "createdAt") AS week_start,
  COUNT(DISTINCT "userId")        AS active_users
FROM "user_events"
WHERE "eventType" IN (
  'open_material',
  'create_material',
  'edit_material',
  'upload_file',
  'view_file',
  'like_material'
)
GROUP BY 1
ORDER BY 1 DESC;

-- 2) Number of created materials (per week)
SELECT
  date_trunc('week', "createdAt") AS week_start,
  COUNT(*)                        AS created_materials
FROM "user_events"
WHERE "eventType" = 'create_material'
GROUP BY 1
ORDER BY 1 DESC;

-- 3) Number of material opens (per week)
SELECT
  date_trunc('week', "createdAt") AS week_start,
  COUNT(*)                        AS material_opens
FROM "user_events"
WHERE "eventType" = 'open_material'
GROUP BY 1
ORDER BY 1 DESC;

-- 4) Return visits by userId (how many distinct active weeks per user)
WITH per_user AS (
  SELECT
    "userId",
    MIN("createdAt")                                  AS first_seen_at,
    MAX("createdAt")                                  AS last_seen_at,
    COUNT(*)                                          AS total_events,
    COUNT(DISTINCT date_trunc('week', "createdAt"))    AS active_weeks
  FROM "user_events"
  WHERE "eventType" IN (
    'open_material',
    'create_material',
    'edit_material',
    'upload_file',
    'view_file',
    'like_material'
  )
  GROUP BY 1
)
SELECT
  "userId",
  active_weeks,
  (active_weeks >= 2) AS is_returning,
  first_seen_at,
  last_seen_at,
  total_events
FROM per_user
ORDER BY active_weeks DESC, last_seen_at DESC;

