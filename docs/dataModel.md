# Модель данных (основные сущности)

Ниже приведена краткая схема основных сущностей, используемых в Healis. Это описание служит ориентиром — конкретные поля и типы реализованы в Sequelize-моделях в кодовой базе.

## User

Описание: пользователь системы (студент, преподаватель, администратор).

Поля (пример):

| Поле | Тип | Описание |
|------|-----|---------|
| id | UUID | PK |
| external_id | string | Идентификатор из SSO (опционально) |
| email | string | Электронная почта |
| name | string | Полное имя |
| role | enum | Роли: student, teacher, admin |
| settings | JSON | Пользовательские настройки (тема и пр.) |
| created_at | timestamp | Время создания |

## Workspace (или Course)

Описание: рабочее пространство по предмету или курсу.

| Поле | Тип | Описание |
|------|-----|---------|
| id | UUID | PK |
| title | string | Название рабочей области |
| description | text | Описание |
| owner_id | UUID | FK → User |
| visibility | enum | private/public/group |
| created_at | timestamp | Время создания |

## Board / Canvas

Описание: интерактивная доска, принадлежащая Workspace.

| Поле | Тип |
|------|-----|
| id | UUID |
| workspace_id | UUID |
| name | string |
| state | JSON | сериализованное состояние доски (опционально) |

## Sticker / Note

Описание: элемент на доске (текст, изображение, ссылка, видео-превью).

| Поле | Тип | Описание |
|------|-----|---------|
| id | UUID | PK |
| board_id | UUID | FK → Board |
| author_id | UUID | FK → User |
| type | enum | text/image/video/link |
| content | JSON | текстовое содержимое / метаданные |
| position | JSON | координаты и размеры на доске |
| attachments | JSON | ссылки на файлы |
| created_at | timestamp |
| updated_at | timestamp |

## Comment

| Поле | Тип |
|------|-----|
| id | UUID |
| sticker_id | UUID |
| author_id | UUID |
| content | text |
| parent_id | UUID | (для вложенных комментариев) |
| created_at | timestamp |

## Reaction

| Поле | Тип |
|------|-----|
| id | UUID |
| target_type | string | sticker/comment |
| target_id | UUID |
| user_id | UUID |
| type | string | like, heart и т.п. |

## Material

| Поле | Тип |
|------|-----|
| id | UUID |
| title | string |
| description | text |
| file_url | string |
| uploader_id | UUID |
| mime_type | string |
| created_at | timestamp |

## Event (Календарь)

| Поле | Тип |
|------|-----|
| id | UUID |
| title | string |
| description | text |
| start_at | timestamp |
| end_at | timestamp |
| workspace_id | UUID |
| created_by | UUID |

## Замечания по моделям

- Для полей, содержащих сложные структуры (состояние доски, позиция стикера), используется JSONB в Postgres.
- Индексы: важные поля (user_id, workspace_id, board_id) индексируются для производительности.
- При масштабировании разделять чтение/запись: репликация Postgres для масштабирования чтения.