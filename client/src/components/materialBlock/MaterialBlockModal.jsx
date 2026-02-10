import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { List } from 'react-window';
import { X, Plus, Trash2, LayoutGrid, Copy, Pencil } from 'lucide-react';
import { getMaterialCards, createMaterialCard, deleteMaterialCard } from '../../http/materialBlocksAPI';
import MaterialCardItem from './MaterialCardItem';
import MaterialCardEditor from './MaterialCardEditor';
import styles from './MaterialBlockModal.module.css';

const SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Сначала новые' },
  { value: 'updatedAt:asc', label: 'Сначала старые' },
  { value: 'title:asc', label: 'По названию (А–Я)' },
  { value: 'title:desc', label: 'По названию (Я–А)' },
  { value: 'createdAt:desc', label: 'По дате создания' },
];

export default function MaterialBlockModal({ block, onClose, isMobile, deskId, onAddCardToBoard }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('updatedAt:desc');
  const [page] = useState(1);
  const [editingCard, setEditingCard] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [menuCard, setMenuCard] = useState(null);
  const [menuPos, setMenuPos] = useState(null);

  const blockId = block?.id;
  const queryKey = ['material-cards', blockId, { search, sort, page }];
  const createDialogInputRef = React.useRef(null);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getMaterialCards(blockId, { search, sort, page, limit: 50 }),
    enabled: Boolean(blockId),
    staleTime: 20 * 1000,
  });

  const deleteCardMutation = useMutation({
    mutationFn: (cardId) => deleteMaterialCard(cardId),
    onSuccess: () => {
      setMenuCard(null);
      setMenuPos(null);
      queryClient.invalidateQueries({ queryKey: ['material-cards', blockId] });
    },
  });

  const duplicateCardMutation = useMutation({
    mutationFn: (card) =>
      createMaterialCard(blockId, {
        title: (card?.title || 'Карточка') + ' (копия)',
        content: card?.content ?? '',
      }),
    onSuccess: (newCard) => {
      setMenuCard(null);
      setMenuPos(null);
      if (!newCard?.id) return;
      const normalized = {
        id: newCard.id,
        title: newCard.title ?? 'Новая карточка',
        content: newCard.content ?? '',
        attachments: newCard.attachments ?? [],
        links: newCard.links ?? [],
        tags: newCard.tags ?? [],
        created_by: newCard.created_by ?? null,
        created_at: newCard.created_at ?? newCard.createdAt,
        updated_at: newCard.updated_at ?? newCard.updatedAt,
      };
      queryClient.invalidateQueries({ queryKey: ['material-cards', blockId] });
      queryClient.setQueryData(queryKey, (prev) => {
        if (!prev) return prev;
        const prevCards = prev?.cards ?? [];
        return { ...prev, cards: [normalized, ...prevCards], total: (prev?.total ?? 0) + 1 };
      });
    },
  });

  const createCardMutation = useMutation({
    mutationFn: (payload) => createMaterialCard(blockId, payload),
    onSuccess: (newCard) => {
      setCreating(false);
      setShowCreateDialog(false);
      setNewCardTitle('');
      if (!newCard?.id) return;
      const normalized = {
        id: newCard.id,
        title: newCard.title ?? 'Новая карточка',
        content: newCard.content ?? '',
        attachments: newCard.attachments ?? [],
        links: newCard.links ?? [],
        tags: newCard.tags ?? [],
        created_by: newCard.created_by ?? null,
        created_at: newCard.created_at ?? newCard.createdAt,
        updated_at: newCard.updated_at ?? newCard.updatedAt,
      };
      queryClient.invalidateQueries({ queryKey: ['material-cards', blockId] });
      queryClient.setQueryData(queryKey, (prev) => {
        if (!prev) return prev;
        const prevCards = prev?.cards ?? [];
        const limit = 50;
        const newTotal = (prev?.total ?? 0) + 1;
        return {
          ...prev,
          cards: [normalized, ...prevCards],
          total: newTotal,
          totalPages: Math.ceil(newTotal / limit),
        };
      });
    },
    onError: () => {
      setCreating(false);
    },
  });

  const cards = useMemo(() => data?.cards ?? [], [data]);

  const openMenuFor = useCallback((card, e) => {
    setMenuCard(card);
    setMenuPos({ x: e?.clientX ?? 0, y: e?.clientY ?? 0 });
  }, []);

  const menuRef = React.useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setMenuCard(null);
      setMenuPos(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuCard(null);
        setMenuPos(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleDeleteCard = useCallback(
    (card) => {
      if (!card?.id) return;
      setMenuCard(null);
      setMenuPos(null);
      deleteCardMutation.mutate(card.id);
    },
    [deleteCardMutation]
  );

  const handleAddToBoard = useCallback(
    (card) => {
      setMenuCard(null);
      setMenuPos(null);
      onAddCardToBoard?.(card);
    },
    [onAddCardToBoard]
  );

  const rowComponent = useCallback(
    ({ index, style, ariaAttributes, ...rest }) => {
      const card = cards[index];
      if (!card) return null;
      return (
        <div style={style} {...ariaAttributes} {...rest}>
          <MaterialCardItem
            card={card}
            onClick={() => setEditingCard(card)}
            onOpenMenu={openMenuFor}
          />
        </div>
      );
    },
    [cards, openMenuFor]
  );

  const openCreateDialog = useCallback(() => {
    if (!blockId) return;
    setNewCardTitle('');
    createCardMutation.reset();
    setShowCreateDialog(true);
  }, [blockId, createCardMutation]);

  useEffect(() => {
    if (showCreateDialog && createDialogInputRef.current) {
      createDialogInputRef.current.focus();
    }
  }, [showCreateDialog]);

  const handleCreateCardSubmit = useCallback(() => {
    if (!blockId) return;
    const title = String(newCardTitle || '').trim() || 'Новая карточка';
    setCreating(true);
    createCardMutation.mutate({ title, content: '' });
  }, [blockId, newCardTitle, createCardMutation]);

  const handleCreateDialogKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateCardSubmit();
      }
      if (e.key === 'Escape') {
        if (!createCardMutation.isPending) {
          setShowCreateDialog(false);
          setNewCardTitle('');
        }
      }
    },
    [handleCreateCardSubmit, createCardMutation.isPending]
  );

  const handleCloseEditor = useCallback(() => {
    setEditingCard(null);
    queryClient.invalidateQueries({ queryKey: ['material-cards', blockId] });
  }, [blockId, queryClient]);

  const handleBack = useCallback(() => setEditingCard(null), []);

  const listHeight = Math.min(400, Math.max(200, cards.length * 52));

  if (editingCard) {
    return (
      <div
        className={styles.overlay}
        onClick={(e) => e.target === e.currentTarget && handleBack()}
        role="dialog"
        aria-modal="true"
        aria-label="Редактор карточки"
      >
        <div className={`${styles.modal} ${styles.editorModal} ${isMobile ? styles.fullscreen : ''}`} onClick={(e) => e.stopPropagation()}>
          <MaterialCardEditor
            card={editingCard}
            blockTitle={block?.title}
            onClose={handleCloseEditor}
            onBack={handleBack}
            isMobile={isMobile}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="material-block-title"
    >
      <div className={`${styles.modal} ${isMobile ? styles.fullscreen : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 id="material-block-title" className={styles.headerTitle}>
            {block?.title || 'Материалы'}
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск карточек"
          />
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Сортировка"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.addCardBtn}
            onClick={openCreateDialog}
            disabled={creating || !blockId}
          >
            <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Создать карточку
          </button>
        </div>

        <div className={styles.listWrap}>
          {isLoading ? (
            <div className={styles.empty}>Загрузка…</div>
          ) : cards.length === 0 ? (
            <div className={styles.empty}>
              {search ? 'Ничего не найдено' : 'Пока нет карточек. Нажмите «Создать карточку».'}
            </div>
          ) : (
            <List
              rowComponent={rowComponent}
              rowCount={cards.length}
              rowHeight={52}
              rowProps={{}}
              overscanCount={5}
              style={{ height: listHeight, width: '100%' }}
            />
          )}
        </div>
      </div>

      {menuCard && menuPos ? (
        <div
          ref={menuRef}
          className={styles.dropdown}
          style={
            isMobile
              ? { top: menuPos.y + 8, left: Math.max(12, (menuPos.x ?? 0) - 240) }
              : { top: menuPos.y + 8, left: menuPos.x - 6 }
          }
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className={styles.ddItem} onClick={() => handleAddToBoard(menuCard)}>
            <LayoutGrid size={18} />
            Добавить на доску
          </button>
          <button
            type="button"
            className={styles.ddItem}
            onClick={() => duplicateCardMutation.mutate(menuCard)}
            disabled={duplicateCardMutation.isPending}
          >
            <Copy size={18} />
            Дублировать
          </button>
          <div className={styles.ddDivider} />
          <button
            type="button"
            className={styles.ddItem}
            onClick={() => {
              setMenuCard(null);
              setMenuPos(null);
              setEditingCard(menuCard);
            }}
          >
            <Pencil size={18} />
            Редактировать
          </button>
          <div className={styles.ddDivider} />
          <button
            type="button"
            className={`${styles.ddItem} ${styles.ddDanger}`}
            onClick={() => handleDeleteCard(menuCard)}
            disabled={deleteCardMutation.isPending}
          >
            <Trash2 size={18} />
            Удалить
          </button>
        </div>
      ) : null}

      {showCreateDialog ? (
        <div
          className={styles.createDialogBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget && !createCardMutation.isPending) {
              setShowCreateDialog(false);
              setNewCardTitle('');
              createCardMutation.reset();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-card-dialog-title"
        >
          <div
            className={styles.createDialogBox}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleCreateDialogKeyDown}
          >
            <h3 id="create-card-dialog-title" className={styles.createDialogTitle}>
              Название карточки
            </h3>
            <input
              ref={createDialogInputRef}
              type="text"
              className={styles.createDialogInput}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Введите название"
              disabled={createCardMutation.isPending}
              aria-label="Название карточки"
              aria-invalid={createCardMutation.isError}
            />
            {createCardMutation.isError ? (
              <p className={styles.createDialogError} role="alert">
                Не удалось создать карточку. Проверьте, что сервер запущен и доступен (например, backend на порту 5000). Можно повторить попытку.
              </p>
            ) : null}
            <div className={styles.createDialogActions}>
              <button
                type="button"
                className={styles.createDialogBtn}
                onClick={() => {
                  if (!createCardMutation.isPending) {
                    setShowCreateDialog(false);
                    setNewCardTitle('');
                    createCardMutation.reset();
                  }
                }}
                disabled={createCardMutation.isPending}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`${styles.createDialogBtn} ${styles.createDialogBtnPrimary}`}
                onClick={handleCreateCardSubmit}
                disabled={createCardMutation.isPending}
              >
                {createCardMutation.isPending ? 'Создание…' : 'ОК'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
