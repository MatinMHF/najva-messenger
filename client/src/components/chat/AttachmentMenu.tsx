import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, Image, File } from 'lucide-react';
import './AttachmentMenu.css';

/**
 * AttachmentMenu (Agent A — item 4)
 *
 * Paperclip button that opens a small glassmorphism popover ABOVE itself with
 * two options:
 *   - "Photos & Videos" (i18n attach.media) -> file picker accept image/*,video/*
 *   - "Files"           (i18n attach.files) -> file picker accept *
 *
 * On selection the chosen files are reported via onFilesSelected so the parent
 * can render pending attachment chips. Actual server upload is NOT done here.
 * TODO(Agent A): wire selected files to the upload pipeline once available.
 */

export interface AttachmentMenuProps {
  onFilesSelected?: (files: File[]) => void;
}

const AttachmentMenu: React.FC<AttachmentMenuProps> = ({ onFilesSelected }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) {
        onFilesSelected?.(files);
      }
      // Reset so selecting the same file again re-triggers change.
      e.target.value = '';
      setOpen(false);
    },
    [onFilesSelected],
  );

  return (
    <div className="attach-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn attach-trigger"
        aria-label="Attach"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
      </button>

      {open && (
        <div className="attach-popover" role="menu">
          <button
            type="button"
            className="attach-option"
            role="menuitem"
            onClick={() => mediaInputRef.current?.click()}
          >
            <Image size={18} className="attach-option-icon" />
            <span>{t('attach.media', 'Photos & Videos')}</span>
          </button>
          <button
            type="button"
            className="attach-option files"
            role="menuitem"
            onClick={() => filesInputRef.current?.click()}
          >
            <File size={18} className="attach-option-icon" />
            <span>{t('attach.files', 'Files')}</span>
          </button>
        </div>
      )}

      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={handleSelect}
      />
      <input
        ref={filesInputRef}
        type="file"
        accept="*"
        multiple
        hidden
        onChange={handleSelect}
      />
    </div>
  );
};

export default AttachmentMenu;
