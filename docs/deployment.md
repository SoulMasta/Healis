# Развёртывание и инфраструктура

## Обзор инфраструктуры

Healis представляет собой типичный WEB-приложение с фронтендом (статическая сборка), backend API и реляционной базой данных. Развёртывание может быть выполнено как на виртуальной машине, так и в контейнерной инфраструктуре (Docker / Kubernetes).

## Компоненты и рекомендации по развёртыванию

- Frontend: собранные статические файлы (React build) — размещаются за CDN или в объектном хранилище (S3/Cloud Storage) + reverse-proxy (nginx).
- Backend: Node.js приложение, запускается как сервис (systemd) или в контейнере. Рекомендуется использовать process manager (PM2) или контейнерный оркестр.
- Database: PostgreSQL — отдельный управляемый инстанс с бэкапами и репликацией по необходимости.
- Хранилище файлов: S3-совместимое (или Supabase Storage) для медиа и вложений.
- Очереди/планировщик: при росте нагрузки для фоновых задач (уведомления, синхронизация интеграций) — RabbitMQ/Redis/Sidekiq или cloud-queue.
- Real-time: Socket.IO, работает поверх HTTP(S) и требует sticky sessions либо Redis Adapter для масштабирования в несколько экземпляров.

## Контейнеризация и Docker

- Рекомендовано: Dockerfile для backend и отдельный образ для static frontend.
- Для локальной разработки использовать docker-compose с сервисами: backend, postgres, redis (опционально).

## Конфигурация и секреты

- Переменные окружения:
  - NODE_ENV (production|development)
  - DATABASE_URL / PG_* (подключение к Postgres)
  - JWT_SECRET
  - SSO_CLIENT_ID, SSO_CLIENT_SECRET (если есть)
  - STORAGE_* (S3 / Supabase)
  - PORT
- Секреты хранить в окружении CI/CD или в vault (HashiCorp Vault / cloud secrets).

## CI/CD

- Pipeline должен включать:
  - lint/test (если есть)
  - сборку frontend
  - сборку и проверку образов контейнеров
  - деплой миграций БД (Sequelize migrations)
  - развёртывание образов на staging/production

## Мониторинг и бэкапы

- Логи: централизованное логирование (ELK/Stackdriver) и метрики (Prometheus/Grafana).
- Бэкапы Postgres: регулярные бэкапы и проверка восстановления.
- План восстановления (RTO/RPO) и регулярное тестирование restore.

## Сетевая безопасность

- HTTPS через reverse-proxy (nginx) и автоматическое обновление сертификатов (Let's Encrypt).
- Ограничение доступа к БД (частная сеть, firewall).
- Ограничение доступа к административным интерфейсам по IP или VPN.

## Примеры запусков

- Локально (dev): `npm run dev` в директории `server` (nodemon), `npm start` в `client` для разработки.
- Production: собрать frontend `npm run build --prefix client`, запустить backend процесс и настроить reverse-proxy на раздачу статики и проксирование API.