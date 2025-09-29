
interface ReaderToolbarProps {
  trail: string[];
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  progress?: number; // 0-1
}

export function ReaderToolbar({ trail, canBack, canForward, onBack, onForward, progress = 0 }: ReaderToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-3 px-4 py-2 bg-card/80 backdrop-blur-sm border-b">
      <div className="flex items-center gap-2">
        <button onClick={onBack} disabled={!canBack} className="px-2 py-1 border rounded disabled:opacity-50 text-sm">
          ← Назад
        </button>
        <button onClick={onForward} disabled={!canForward} className="px-2 py-1 border rounded disabled:opacity-50 text-sm">
          Вперед →
        </button>
        <div className="text-sm text-muted-foreground">{trail.join(' › ')}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground">Прогресс</div>
        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}