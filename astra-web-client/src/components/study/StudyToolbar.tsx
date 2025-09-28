import { Button } from '../ui/button';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

interface StudyToolbarProps {
  onBack: () => void;
  onForward: () => void;
  onExit: () => void;
  isLoading: boolean;
  canBack: boolean;
  canForward: boolean;
}

export default function StudyToolbar({ onBack, onForward, onExit, isLoading, canBack, canForward }: StudyToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-card/60 flex-shrink-0">
      <Button size="icon" variant="ghost" onClick={onBack} disabled={isLoading || !canBack}>
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onForward} disabled={isLoading || !canForward}>
        <ArrowRight className="w-4 h-4" />
      </Button>
      <div className="text-xs text-muted-foreground flex-1 truncate">
        {/* Placeholder for breadcrumb trail */}
        Study Trail...
      </div>
      <Button size="icon" variant="ghost" onClick={onExit} disabled={isLoading}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
