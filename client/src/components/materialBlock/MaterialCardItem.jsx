import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import styles from './MaterialBlockModal.module.css';

const MaterialCardItem = React.memo(function MaterialCardItem({ card, onClick, onOpenMenu }) {
  const title = card?.title || 'Без названия';

  return (
    <div className={styles.cardRow}>
      <button
        type="button"
        className={styles.cardRowBtn}
        onClick={() => onClick?.(card)}
      >
        <span className={styles.cardTitle}>{title}</span>
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
