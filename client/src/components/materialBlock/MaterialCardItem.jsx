import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import styles from './MaterialBlockModal.module.css';

const MaterialCardItem = React.memo(function MaterialCardItem({ card, onClick, onOpenMenu }) {
  const title = card?.title || 'Без названия';
  const updatedAt = card?.updated_at || card?.updatedAt;
  const dateStr = updatedAt
    ? new Date(updatedAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: updatedAt.includes(new Date().getFullYear()) ? undefined : 'numeric',
      })
    : '';

  return (
    <div className={styles.cardRow}>
      <button
        type="button"
        className={styles.cardRowBtn}
        onClick={() => onClick?.(card)}
      >
        <span className={styles.cardTitle}>{title}</span>
        {dateStr ? <span className={styles.cardDate}>{dateStr}</span> : null}
      </button>
      <button
        type="button"
        className={styles.dotsBtn}
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu?.(card, e);
        }}
        aria-label="Меню карточки"
        title="Меню"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
});

export default MaterialCardItem;
