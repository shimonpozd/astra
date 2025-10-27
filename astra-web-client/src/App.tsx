import { ChatLayout } from './components/chat/ChatLayout';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StudyLanding from './pages/StudyLanding';
import AdminLayout from './pages/AdminLayout';
import GeneralSettings from './pages/admin/GeneralSettings';
import PersonalityList from './pages/admin/PersonalityList';
import PersonalityCreate from './pages/admin/PersonalityCreate';
import PersonalityEdit from './pages/admin/PersonalityEdit';
import PromptEditor from './pages/admin/PromptEditor';
import { useTextSelectionListener } from './hooks/useTextSelectionListener';
import { LexiconPanel } from './components/LexiconPanel';
import { ThemeProvider } from './components/theme-provider';
import { FontSettingsProvider } from './contexts/FontSettingsContext';

function App() {
  useTextSelectionListener();

  return (
    <ThemeProvider defaultTheme="light" storageKey="astra-ui-theme">
      <FontSettingsProvider>
        <BrowserRouter>
        <div className="h-screen w-full bg-background">
          <Routes>
            <Route path="/" element={<ChatLayout />} />
            <Route path="/chat" element={<Navigate to="/" replace />} />
            <Route path="/chat/:sessionId" element={<ChatLayout />} />
            <Route path="/study" element={<StudyLanding />} />
            <Route path="/study/:sessionId" element={<ChatLayout />} />
            <Route path="/daily/:sessionId" element={<ChatLayout />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/settings" replace />} />
              <Route path="settings" element={<GeneralSettings />} />
              <Route path="personalities" element={<PersonalityList />} />
              <Route path="personalities/new" element={<PersonalityCreate />} />
              <Route path="personalities/edit/:id" element={<PersonalityEdit />} />
              <Route path="prompts" element={<PromptEditor />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <LexiconPanel />
        </div>
        </BrowserRouter>
      </FontSettingsProvider>
    </ThemeProvider>
  );
}

export default App;
