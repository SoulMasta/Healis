import React, { useRef, useCallback, useState } from 'react';
import styles from './MaterialCardEditor.module.css';

export default function FileUploader({ onUpload, disabled, children }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file) => {
      if (!file || disabled) return;
      onUpload?.(file);
    },
    [onUpload, disabled]
  );

  const handleInputChange = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }, []);

  return (
    <div
      className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className={styles.hiddenInput}
        onChange={handleInputChange}
        disabled={disabled}
        accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip,.rar"
      />
      {children}
    </div>
  );
}
