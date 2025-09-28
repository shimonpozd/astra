import React, { useMemo, useState } from 'react';

interface NoteItem {
  ref: string;
  commentator: string | null;
  type: string;
  point: string;
}

interface ResearchPanelProps {
  researchState: {
    currentStatus: string;
    currentPlan: any;
    currentDraft: string;
    currentCritique: string[];
    isResearching: boolean;
    error: string | null;
    notesFeed: NoteItem[];
  };
  sources?: any[];
  isVisible: boolean;
  onClose?: () => void;
}

const ResearchPanel: React.FC<ResearchPanelProps> = ({ researchState, sources = [], isVisible, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'notes' | 'draft' | 'critique' | 'sources'>('overview');
  const [filter, setFilter] = useState('');

  if (!isVisible) return null;

  const statusColor = useMemo(() => {
    const s = researchState.currentStatus || '';
    if (/error/i.test(s)) return 'text-red-400';
    if (/complete/i.test(s)) return 'text-green-400';
    if (/(processing|working)/i.test(s)) return 'text-blue-400';
    if (/planning/i.test(s)) return 'text-amber-400';
    if (/draft/i.test(s)) return 'text-yellow-400';
    return 'text-gray-300';
  }, [researchState.currentStatus]);

  const statusIcon = useMemo(() => {
    const s = researchState.currentStatus || '';
    if (/error/i.test(s)) return '❌';
    if (/complete/i.test(s)) return '✅';
    if (/planning/i.test(s)) return '📋';
    if (/critique/i.test(s)) return '🔍';
    if (/draft/i.test(s)) return '📝';
    if (/(processing|working)/i.test(s)) return '🔄';
    return researchState.isResearching ? '🔬' : '⏳';
  }, [researchState.currentStatus, researchState.isResearching]);

  const filteredNotes = useMemo(() => {
    if (!filter.trim()) return researchState.notesFeed;
    const f = filter.toLowerCase();
    return researchState.notesFeed.filter(n =>
      (n.ref || '').toLowerCase().includes(f) ||
      (n.commentator || '').toLowerCase().includes(f) ||
      (n.type || '').toLowerCase().includes(f) ||
      (n.point || '').toLowerCase().includes(f)
    );
  }, [filter, researchState.notesFeed]);

  const getNoteIcon = (type: string) => {
    switch ((type || '').toLowerCase()) {
      case 'primary': return '📖';
      case 'commentary': return '💬';
      case 'analysis': return '🔍';
      case 'summary': return '📝';
      case 'insight': return '💡';
      default: return '📌';
    }
  };

  const formatRef = (ref: string) => ref?.replace(/\./g, ' ').replace(/(\d+):(\d+)/, '$1:$2');

  return (
    <div className="fixed top-5 right-5 w-[420px] max-h-[85vh] bg-card text-foreground rounded-xl border shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{statusIcon}</span>
          <div>
            <div className="text-sm font-semibold">Режим исследования</div>
            {researchState.currentStatus && (
              <div className={`text-xs ${statusColor}`}>{researchState.currentStatus}</div>
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-6 text-xs border-b bg-muted/30">
        {[
          { id: 'overview', label: 'Статус' },
          { id: 'plan', label: 'План' },
          { id: 'notes', label: 'Заметки' },
          { id: 'draft', label: 'Черновик' },
          { id: 'critique', label: 'Критика' },
          { id: 'sources', label: 'Источники' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-2 transition-colors ${activeTab === (t.id as any) ? 'bg-card/80 text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-sm space-y-3">
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="rounded-lg border-l-4 border-green-500 bg-green-500/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span>{statusIcon}</span>
                <span className="font-medium">{researchState.isResearching ? 'Идёт исследование' : 'Готово'}</span>
              </div>
              <div className="text-xs opacity-80">Заметок создано: {researchState.notesFeed.length}</div>
            </div>
            {researchState.error && (
              <div className="rounded-lg border-l-4 border-red-500 bg-red-500/10 p-3">
                <div className="font-medium mb-1">Ошибка</div>
                <div className="text-xs opacity-90">{researchState.error}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div>
            {researchState.currentPlan ? (
              <pre className="text-xs whitespace-pre-wrap bg-muted/30 border rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(researchState.currentPlan, null, 2)}
              </pre>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-6">План ещё не получен…</div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Фильтр по ref/комментатору/типу/тексту…"
              className="w-full h-8 px-2 text-xs rounded border bg-background"
            />
            {filteredNotes.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">Заметок пока нет</div>
            )}
            {filteredNotes.map((note, idx) => (
              <div key={`${note.ref}-${idx}`} className="rounded-lg border bg-card/60 p-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{getNoteIcon(note.type)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{formatRef(note.ref)}</span>
                      {note.commentator && <span className="text-xs text-muted-foreground">by {note.commentator}</span>}
                      <span className="text-[10px] px-1 rounded bg-muted/50 text-muted-foreground">{note.type}</span>
                    </div>
                    <div className="text-xs leading-relaxed">{note.point}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'draft' && (
          <div>
            {researchState.currentDraft ? (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button
                    onClick={() => navigator.clipboard.writeText(researchState.currentDraft)}
                    className="text-xs px-2 py-1 rounded border bg-muted/30 hover:bg-muted"
                  >Копировать</button>
                </div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed border rounded-lg p-3 bg-card/60 max-h-80 overflow-y-auto">
                  {researchState.currentDraft}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-6">Черновик ещё не готов…</div>
            )}
          </div>
        )}

        {activeTab === 'critique' && (
          <div className="space-y-2">
            {researchState.currentCritique.length > 0 ? (
              researchState.currentCritique.map((c, i) => (
                <div key={i} className="rounded-lg border-l-4 border-purple-500 bg-purple-500/10 p-2 text-xs">
                  {c}
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground text-center py-6">Критика ещё не получена…</div>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="space-y-2">
            {(!sources || sources.length === 0) && (
              <div className="text-xs text-muted-foreground text-center py-6">Источников пока нет</div>
            )}
            {sources?.map((src: any, idx: number) => (
              <div key={src.id || idx} className="rounded-lg border bg-card/60 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium truncate" title={src.reference || src.heRef || src.book}>
                    {src.reference || src.heRef || src.book || 'Источник'}
                  </div>
                  {src.ui_color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: src.ui_color }} />}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  {(src.author ? `${src.author} • ` : '') + (src.book || src.lang || '')}
                </div>
                {src.text && <div className="text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">{src.text}</div>}
                {src.url && (
                  <a href={src.url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-2 inline-block">Открыть источник</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-muted/20 text-[11px] text-muted-foreground text-center">
        Заметок: {researchState.notesFeed.length} • Критика: {researchState.currentCritique.length}
      </div>
    </div>
  );
};

export default ResearchPanel;