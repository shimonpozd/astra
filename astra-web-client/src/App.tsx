import { ChatLayout } from './components/chat/ChatLayout';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import StudyLanding from './pages/StudyLanding';
import AdminLayout from './pages/AdminLayout';
import GeneralSettings from './pages/admin/GeneralSettings';
import PersonalityList from './pages/admin/PersonalityList';
import PersonalityCreate from './pages/admin/PersonalityCreate';
import PersonalityEdit from './pages/admin/PersonalityEdit';
import PromptEditor from './pages/admin/PromptEditor';
import UserManagementPage from './pages/admin/UserManagement';
import { useTextSelectionListener } from './hooks/useTextSelectionListener';
import { LexiconPanel } from './components/LexiconPanel';
import { ThemeProvider } from './components/theme-provider';
import { FontSettingsProvider } from './contexts/FontSettingsContext';
import LoginPage from './pages/Login';
import { RequireAuth } from './components/auth/RequireAuth';

function AuthenticatedShell() {
  return (
    <div className="h-screen w-full bg-background">
      <Outlet />
      <LexiconPanel />
    </div>
  );
}

function App() {
  useTextSelectionListener();

  return (
    <ThemeProvider defaultTheme="light" storageKey="astra-ui-theme">
      <FontSettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AuthenticatedShell />}>
                <Route path="/" element={<ChatLayout />} />
                <Route path="/chat" element={<Navigate to="/" replace />} />
                <Route path="/chat/:sessionId" element={<ChatLayout />} />
                <Route path="/study" element={<StudyLanding />} />
                <Route path="/study/:sessionId" element={<ChatLayout />} />
                <Route path="/daily/:sessionId" element={<ChatLayout />} />
                <Route element={<RequireAuth admin />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<Navigate to="/admin/settings" replace />} />
                    <Route path="settings" element={<GeneralSettings />} />
                    <Route path="personalities" element={<PersonalityList />} />
                    <Route path="personalities/new" element={<PersonalityCreate />} />
                    <Route path="personalities/edit/:id" element={<PersonalityEdit />} />
                    <Route path="prompts" element={<PromptEditor />} />
                    <Route path="users" element={<UserManagementPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </FontSettingsProvider>
    </ThemeProvider>
  );
}

export default App;
