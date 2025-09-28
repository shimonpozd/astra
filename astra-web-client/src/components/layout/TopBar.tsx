
import React from 'react';
import { useNavigate } from 'react-router-dom';
import PersonaSelector from '../PersonaSelector';

interface TopBarProps {
  agentId: string;
  setAgentId: (v: string) => void;
  onOpenStudy?: () => void;
  onToggleSidebar?: () => void;
  isSidebarVisible?: boolean;
  onToggleChatArea?: () => void;
  isChatAreaVisible?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  agentId,
  setAgentId,
  onOpenStudy,
  onToggleSidebar,
  isSidebarVisible,
  onToggleChatArea,
  isChatAreaVisible,
}) => {
  const navigate = useNavigate();

  return (
    <div className="h-16 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="h-8 w-8 rounded hover:bg-accent/50 flex items-center justify-center"
              title={isSidebarVisible ? "Скрыть список чатов" : "Показать список чатов"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={isSidebarVisible ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
              </svg>
            </button>
        )}
        {onToggleChatArea && (
            <button
              onClick={onToggleChatArea}
              className="h-8 w-8 rounded hover:bg-accent/50 flex items-center justify-center"
              title={isChatAreaVisible ? "Скрыть чат" : "Показать чат"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={isChatAreaVisible ? "M19 9l-7 7-7-7" : "M5 15l7-7 7 7"} />
              </svg>
            </button>
        )}
        <h1 className="font-semibold">Astra</h1>
      </div>
      <div className="flex items-center gap-2">
        {onOpenStudy && (
            <button
              onClick={() => {
                console.log('Study Mode button clicked');
                onOpenStudy();
              }}
              className="h-8 text-xs rounded border px-2 flex items-center hover:bg-accent cursor-pointer"
              title="Открыть Study Mode"
            >
              Study Mode
            </button>
        )}
        <button
          onClick={() => {
            console.log('Admin button clicked');
            navigate('/admin');
          }}
          className="h-8 text-xs rounded border px-2 flex items-center hover:bg-accent cursor-pointer"
          title="Открыть Admin Panel"
        >
          Admin
        </button>
        <div className="w-48">
          <PersonaSelector selected={agentId} onSelect={setAgentId} />
        </div>
      </div>
    </div>
  );
};

export default TopBar;
