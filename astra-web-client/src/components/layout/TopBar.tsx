import React from 'react';
import { useNavigate } from 'react-router-dom';
import { VscLayoutPanelJustify, VscLayoutPanel, VscLayoutPanelOff, VscLayoutPanelRight } from 'react-icons/vsc';

import PersonaSelector from '../PersonaSelector';
import { ThemeToggle } from '../ThemeToggle';
import { useLayout } from '../../contexts/LayoutContext';
import { useAuth } from '../../contexts/AuthContext';
import { debugLog } from '../../utils/debugLogger';

interface TopBarProps {
  agentId: string;
  setAgentId: (value: string) => void;
  onOpenStudy?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ agentId, setAgentId, onOpenStudy }) => {
  const navigate = useNavigate();
  const { mode, setMode } = useLayout();
  const { logout, user } = useAuth();

  return (
    <div className="h-16 border-b panel-outer panel-padding-lg flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-standard">
        <h1 className="font-semibold">Astra</h1>
      </div>
      <div className="flex items-center gap-compact">
        <div className="flex items-center gap-compact mr-2">
          <button
            onClick={() => setMode('talmud_default')}
            className={`h-8 w-8 rounded-lg border hover:bg-accent/50 transition-colors flex items-center justify-center ${
              mode === 'talmud_default' ? 'bg-accent/30 border-primary/50' : 'border-border/50'
            }`}
            title="Талмуд: две панели"
            aria-label="Талмуд"
          >
            <VscLayoutPanelJustify size={16} />
          </button>
          <button
            onClick={() => setMode('focus_only')}
            className={`h-8 w-8 rounded-lg border hover:bg-accent/50 transition-colors flex items-center justify-center ${
              mode === 'focus_only' ? 'bg-accent/30 border-primary/50' : 'border-border/50'
            }`}
            title="Только фокус"
            aria-label="Фокус"
          >
            <VscLayoutPanel size={16} />
          </button>
          <button
            onClick={() => setMode('focus_with_bottom_commentary')}
            className={`h-8 w-8 rounded-lg border hover:bg-accent/50 transition-colors flex items-center justify-center ${
              mode === 'focus_with_bottom_commentary' ? 'bg-accent/30 border-primary/50' : 'border-border/50'
            }`}
            title="Фокус с нижним комментарием"
            aria-label="Фокус + комментарий"
          >
            <VscLayoutPanelOff size={16} />
          </button>
          <button
            onClick={() => setMode('vertical_three')}
            className={`h-8 w-8 rounded-lg border hover:bg-accent/50 transition-colors flex items-center justify-center ${
              mode === 'vertical_three' ? 'bg-accent/30 border-primary/50' : 'border-border/50'
            }`}
            title="Три вертикальные панели"
            aria-label="Три панели"
          >
            <VscLayoutPanelRight size={16} />
          </button>
        </div>
        {onOpenStudy && (
          <button
            onClick={() => {
              debugLog('Study Mode button clicked');
              onOpenStudy();
            }}
            className="h-8 text-xs rounded-lg border border-border/50 px-3 flex items-center hover:bg-accent/50 cursor-pointer transition-colors"
            title="Открыть Study Mode"
          >
            Study Mode
          </button>
        )}
        {user ? (
          <span className="text-xs text-muted-foreground mr-2">{user.username}</span>
        ) : null}
        <button
          onClick={() => {
            debugLog('Admin button clicked');
            navigate('/admin');
          }}
          className="h-8 text-xs rounded-lg border border-border/50 px-3 flex items-center hover:bg-accent/50 cursor-pointer transition-colors"
          title="Админ-панель"
        >
          Admin
        </button>
        <button
          onClick={logout}
          className="h-8 text-xs rounded-lg border border-border/50 px-3 flex items-center hover:bg-accent/50 cursor-pointer transition-colors"
        >
          Выйти
        </button>
        <div className="w-48">
          <PersonaSelector selected={agentId} onSelect={setAgentId} />
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
};

export default TopBar;
