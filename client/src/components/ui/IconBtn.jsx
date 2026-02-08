import React from 'react';

export default function IconBtn({ label, title, children, onClick, disabled, buttonRef, className }) {
  return (
    <button
      type="button"
      className={className || ''}
      ref={buttonRef}
      onClick={onClick}
      aria-label={label}
      title={title || label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
