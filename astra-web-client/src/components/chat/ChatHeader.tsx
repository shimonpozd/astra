import { debugLog } from '../../utils/debugLogger';
interface ChatHeaderProps {
  onOpenStudy: () => void;
}

export default function ChatHeader({ onOpenStudy }: ChatHeaderProps) {
  // Placeholder for agent selection logic
  const agentId = 'default';
  const setAgentId = (id: string) => debugLog('Agent selected:', id);

  return (
    <header className="h-14 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="font-semibold">Astra Chat</h1>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpenStudy} className="h-8 text-xs rounded border px-2 flex items-center hover:bg-accent" title="Открыть Study Mode">
          Study Mode
        </button>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="h-8 text-xs rounded border bg-background px-2"
          title="Выбор ассистента"
        >
          <option value="default">default</option>
          <option value="chevruta_deepresearch">chevruta_deepresearch</option>
          <option value="chevruta_study_bimodal">chevruta_study_bimodal</option>
        </select>
      </div>
    </header>
  );
}