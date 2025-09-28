import React, { useEffect, useRef } from 'react';
import { NoteCreatedEvent } from '../types/index';

interface ResearchFeedProps {
  notes: NoteCreatedEvent['data'][];
  isVisible: boolean;
}

const ResearchFeed: React.FC<ResearchFeedProps> = ({ notes, isVisible }) => {
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new notes are added
  useEffect(() => {
    if (feedRef.current && isVisible) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [notes, isVisible]);

  if (!isVisible || notes.length === 0) {
    return null;
  }

  const getNoteIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'primary':
        return '📖';
      case 'commentary':
        return '💬';
      case 'analysis':
        return '🔍';
      case 'summary':
        return '📝';
      case 'insight':
        return '💡';
      default:
        return '📌';
    }
  };

  const formatRef = (ref: string) => {
    // Format references nicely (e.g., "Genesis 1:1" instead of "Genesis.1.1")
    return ref.replace(/\./g, ' ').replace(/(\d+):(\d+)/, '$1:$2');
  };

  return (
    <div
      ref={feedRef}
      className="research-feed"
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        width: '320px',
        maxHeight: '400px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        borderRadius: '8px',
        padding: '12px',
        overflowY: 'auto',
        zIndex: 1000,
        fontSize: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          marginBottom: '8px',
          fontSize: '14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          paddingBottom: '4px',
        }}
      >
        🔄 Research Feed ({notes.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {notes.map((note, index) => (
          <div
            key={index}
            style={{
              padding: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              borderLeft: '3px solid #4CAF50',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontSize: '14px' }}>{getNoteIcon(note.type)}</span>
              <span style={{ fontWeight: 'bold', fontSize: '11px' }}>
                {formatRef(note.ref)}
              </span>
              {note.commentator && (
                <span style={{ fontSize: '10px', opacity: 0.7 }}>
                  by {note.commentator}
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: '11px',
                lineHeight: '1.3',
                opacity: 0.9,
                maxHeight: '60px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
              title={note.point} // Show full text on hover
            >
              {note.point}
            </div>

            <div style={{ fontSize: '9px', opacity: 0.6, marginTop: '4px' }}>
              {note.type}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResearchFeed;