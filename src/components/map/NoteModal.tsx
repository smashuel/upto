import React, { useState } from 'react';
import type { MapNote } from '../../services/NoteManager';

const NOTE_TYPES: Array<{ value: MapNote['type']; label: string; color: string }> = [
  { value: 'info', label: 'Info', color: '#00B8D4' },
  { value: 'warning', label: 'Warning', color: '#FF6B00' },
  { value: 'accommodation', label: 'Accommodation', color: '#007CFF' },
  { value: 'photo', label: 'Photo', color: '#007CFF' },
  { value: 'general', label: 'General', color: '#6B7280' },
];

interface NoteModalProps {
  open: boolean;
  onSubmit: (data: { content: string; title: string; type: MapNote['type'] }) => void;
  onCancel: () => void;
}

const NoteModal: React.FC<NoteModalProps> = ({ open, onSubmit, onCancel }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<MapNote['type']>('info');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit({ content: content.trim(), title: title.trim() || 'Map Note', type });
    setTitle('');
    setContent('');
    setType('info');
  };

  const handleCancel = () => {
    setTitle('');
    setContent('');
    setType('info');
    onCancel();
  };

  return (
    <div className="note-modal-backdrop" onClick={handleCancel}>
      <div className="note-modal" onClick={(e) => e.stopPropagation()}>
        <div className="note-modal-header">Add Note</div>
        <form onSubmit={handleSubmit}>
          <div className="note-modal-field">
            <label className="note-modal-label" htmlFor="note-title">Title</label>
            <input
              id="note-title"
              className="note-modal-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Map Note"
              autoFocus
            />
          </div>
          <div className="note-modal-field">
            <label className="note-modal-label" htmlFor="note-content">Content</label>
            <textarea
              id="note-content"
              className="note-modal-input note-modal-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What do you want to note here?"
              rows={3}
              required
            />
          </div>
          <div className="note-modal-field">
            <label className="note-modal-label">Type</label>
            <div className="note-modal-types">
              {NOTE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`note-type-chip ${type === t.value ? 'active' : ''}`}
                  onClick={() => setType(t.value)}
                  style={{ '--chip-color': t.color } as React.CSSProperties}
                >
                  <span className="note-type-dot" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="note-modal-actions">
            <button type="button" className="note-modal-btn note-modal-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="note-modal-btn note-modal-btn-submit" disabled={!content.trim()}>
              Add Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoteModal;
