import { Button } from '../ui/button';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import NavigationPanel from './NavigationPanel';

interface StudyToolbarProps {
  onBack: () => void;
  onForward: () => void;
  onExit: () => void;
  onNavigate: (ref: string) => void;
  currentRef?: string;
  isLoading: boolean;
  canBack: boolean;
  canForward: boolean;
}

export default function StudyToolbar({ onBack, onForward, onExit, onNavigate, currentRef, isLoading, canBack, canForward }: StudyToolbarProps) {
  return (
    <div className="flex items-center gap-compact panel-padding-sm border-b panel-outer flex-shrink-0">
      <Button size="icon" variant="ghost" onClick={onBack} disabled={isLoading || !canBack}>
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onForward} disabled={isLoading || !canForward}>
        <ArrowRight className="w-4 h-4" />
      </Button>
      <NavigationPanel 
        currentRef={currentRef}
        onNavigate={onNavigate}
        className="flex-1"
      />
      <Button size="icon" variant="ghost" onClick={onExit} disabled={isLoading}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
