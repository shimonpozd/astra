import React, { useState } from 'react';

interface SourceCardProps {
  source: {
    id: string;
    author: string;
    book: string;
    reference: string;
    text: string;
    url: string;
    ui_color: string;
    lang: string;
    heRef?: string;
  };
}

const SourceCard: React.FC<SourceCardProps> = ({ source }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHebrew, setShowHebrew] = useState(false);

  const formatReference = (ref: string) => {
    // Format references nicely (e.g., "Genesis.1.1" → "Genesis 1:1")
    return ref.replace(/\./g, ' ').replace(/(\d+):(\d+)/, '$1:$2');
  };

  const truncateText = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const getLanguageIcon = (lang: string) => {
    switch (lang) {
      case 'he': return 'ע';
      case 'en': return 'A';
      default: return '•';
    }
  };

  const getLanguageName = (lang: string) => {
    switch (lang) {
      case 'he': return 'Hebrew';
      case 'en': return 'English';
      default: return 'Unknown';
    }
  };

  return (
    <div
      className="source-card"
      style={{
        backgroundColor: `${source.ui_color}10`,
        border: `2px solid ${source.ui_color}30`,
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: source.ui_color,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: source.ui_color }}>
              {source.author}
            </span>
            <span style={{ fontSize: '10px', color: '#666' }}>
              {getLanguageIcon(source.lang)}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#333', fontWeight: '500' }}>
            {formatReference(source.reference)}
          </div>
        </div>
        <div style={{ fontSize: '10px', color: '#666' }}>
          {source.book}
        </div>
      </div>

      {/* Text Content */}
      <div style={{ marginBottom: '8px' }}>
        <div
          style={{
            fontSize: '12px',
            lineHeight: '1.4',
            color: '#333',
            direction: source.lang === 'he' ? 'rtl' : 'ltr',
            textAlign: source.lang === 'he' ? 'right' : 'left',
          }}
        >
          {isExpanded ? source.text : truncateText(source.text)}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowHebrew(!showHebrew);
            }}
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              backgroundColor: showHebrew ? source.ui_color : 'transparent',
              color: showHebrew ? 'white' : source.ui_color,
              border: `1px solid ${source.ui_color}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {getLanguageIcon(source.lang === 'he' ? 'en' : 'he')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(source.url, '_blank');
            }}
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              backgroundColor: 'transparent',
              color: source.ui_color,
              border: `1px solid ${source.ui_color}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            🔗
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#666' }}>
          {isExpanded ? '▼' : '▶'}
        </div>
      </div>

      {/* Hebrew Text (if available) */}
      {showHebrew && source.heRef && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: `${source.ui_color}05`,
            borderRadius: '4px',
            fontSize: '14px',
            direction: 'rtl',
            textAlign: 'right',
            fontFamily: 'serif',
          }}
        >
          {source.heRef}
        </div>
      )}
    </div>
  );
};

export default SourceCard;