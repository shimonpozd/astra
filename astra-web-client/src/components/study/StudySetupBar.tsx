import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface StudySetupBarProps {
  onStartStudy: (textRef: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export default function StudySetupBar({ onStartStudy, onCancel, isLoading }: StudySetupBarProps) {
  const [textRef, setTextRef] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textRef.trim()) {
      onStartStudy(textRef.trim());
    }
  };

  return (
    <div className="panel-padding-sm border-b panel-outer flex-shrink-0">
      <form onSubmit={handleSubmit} className="flex gap-compact items-center">
        <Input
          placeholder="Введите ссылку (например, Shabbat 21a)"
          value={textRef}
          onChange={(e) => setTextRef(e.target.value)}
          className="flex-1 bg-background"
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !textRef.trim()}>
          {isLoading ? 'Загрузка...' : 'Открыть'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
          Отмена
        </Button>
      </form>
    </div>
  );
}
