import React, { useMemo } from 'react';

type ThinkingEventType =
  | 'thought_chunk'
  | 'status'
  | 'plan'
  | 'source'
  | 'critique'
  | 'internal_questions'
  | 'completeness_check'
  | 'note_created';

export interface ThinkingEvent {
  id: string;
  type: ThinkingEventType;
  data: any;
  timestamp?: number;
}

export default function ThinkingProcessPanel({
  events,
  isVisible,
  onClose,
}: {
  events: ThinkingEvent[];
  isVisible: boolean;
  onClose?: () => void;
}) {
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [events]);

  if (!isVisible) return null;

  const renderIcon = (type: ThinkingEventType) => {
    switch (type) {
      case 'thought_chunk':
        return '💭';
      case 'status':
        return '⚙️';
      case 'plan':
        return '📋';
      case 'source':
        return '📚';
      case 'critique':
        return '🔍';
      case 'internal_questions':
        return '❓';
      case 'completeness_check':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  const renderContent = (ev: ThinkingEvent) => {
    switch (ev.type) {
      case 'thought_chunk':
        return <div className="text-xs whitespace-pre-wrap text-muted-foreground">{ev.data?.text || String(ev.data)}</div>;
      case 'status':
        return <div className="text-xs text-muted-foreground">{ev.data?.message || String(ev.data)}</div>;
      case 'plan': {
        const primary = ev.data?.primary_ref || ev.data?.primary || ev.data?.topic;
        const questions: string[] = ev.data?.research_questions || ev.data?.questions || [];
        return (
          <div className="text-xs text-muted-foreground space-y-1">
            {primary && <div><span className="opacity-70">Источник:</span> {primary}</div>}
            {Array.isArray(questions) && questions.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5">
                {questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        );
      }
      case 'source': {
        const ref = ev.data?.ref || ev.data?.reference || ev.data?.heRef;
        const status = ev.data?.status || ev.data?.state;
        return (
          <div className="text-xs text-muted-foreground">
            {ref && <span className="font-medium">{ref}</span>} {status && <span className="opacity-70">— {status}</span>}
          </div>
        );
      }
      case 'critique': {
        const feedback: string[] = Array.isArray(ev.data?.feedback) ? ev.data.feedback : [String(ev.data)];
        return (
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
            {feedback.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        );
      }
      case 'internal_questions': {
        const qs: string[] = Array.isArray(ev.data?.questions) ? ev.data.questions : [];
        return (
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
            {qs.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        );
      }
      case 'completeness_check': {
        const reason = ev.data?.reason;
        const recs: string[] = Array.isArray(ev.data?.recommendations) ? ev.data.recommendations : [];
        return (
          <div className="text-xs text-muted-foreground space-y-1">
            {reason && <div><span className="opacity-70">Причина:</span> {reason}</div>}
            {recs.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5">
                {recs.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        );
      }
      default:
        return <pre className="text-[11px] text-muted-foreground/90 bg-muted/10 p-2 rounded overflow-x-auto">{JSON.stringify(ev.data, null, 2)}</pre>;
    }
  };

  return (
    <div className="fixed right-5 top-5 w-[420px] max-h-[85vh] bg-card text-foreground rounded-xl border shadow-2xl overflow-hidden flex flex-col z-50">
      <div className="px-4 py-3 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between">
        <div className="text-sm font-semibold">Ход мыслей</div>
        {onClose && (
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sorted.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">Пока нет событий</div>
        )}
        {sorted.map((ev) => (
          <div key={ev.id} className="rounded-lg border bg-card/60 p-2">
            <div className="flex items-start gap-2">
              <span className="text-sm mt-0.5">{renderIcon(ev.type)}</span>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground/70 mb-1">{ev.type}</div>
                {renderContent(ev)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


