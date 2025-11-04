import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import TopBar from '../components/layout/TopBar'; // Import TopBar

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const [agentId, setAgentId] = useState<string>(() => {
    return localStorage.getItem("astra_agent_id") || "default";
  });

  useEffect(() => {
    localStorage.setItem("astra_agent_id", agentId);
  }, [agentId]);

  const navItems = [
    { path: '/admin/settings', label: 'General Settings' },
    { path: '/admin/personalities', label: 'Personalities' },
    { path: '/admin/prompts', label: 'Prompts' },
    { path: '/admin/users', label: 'Users' },
  ];

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Shared Top Bar */}
      <TopBar agentId={agentId} setAgentId={setAgentId} />

      {/* Admin Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-64 bg-card border-r border-border flex flex-col">
          <div className="p-6 border-b border-border">
            <h1 className="text-xl font-semibold">Admin Panel</h1>
          </div>

          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      location.pathname === item.path
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="p-4 border-t border-border">
            <Link
              to="/"
              className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              ← Back to Chat
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;