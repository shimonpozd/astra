import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useChat } from "../../hooks/useChat";
import { useStudyMode } from "../../hooks/useStudyMode";
import { useTextSelectionListener } from "../../hooks/useTextSelectionListener";
import BookshelfPanel from "../study/BookshelfPanel";
import StudyMode from "../study/StudyMode";
import StudySetupBar from "../study/StudySetupBar";
import ChatSidebar from "./ChatSidebar";
import ChatViewport from "./ChatViewport";
import MessageComposer from "./MessageComposer";
import TopBar from "../layout/TopBar"; // Import the new TopBar
import { api } from "../../services/api"; // Import api for daily session creation

export function ChatLayout() {
  const navigate = useNavigate();
  const { sessionId: urlChatId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const [isStudySetupOpen, setIsStudySetupOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isChatAreaVisible, setIsChatAreaVisible] = useState(true);
  const [agentId, setAgentId] = useState<string>(() => {
    return localStorage.getItem("astra_agent_id") || "default";
  });

  // Study mode chat state
  const [studyMessages, setStudyMessages] = useState<any[]>([]);
  const [studyIsSending, setStudyIsSending] = useState(false);
  
  // Panel selection state for Iyun/Girsa modes
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  
  // Calculate current ref for bookshelf based on selected panel
  const getCurrentRefForBookshelf = () => {
    if (!studySnapshot) return undefined;
    
    // If a panel is selected (Iyun mode), use that panel's ref
    if (selectedPanelId) {
      switch (selectedPanelId) {
        case 'focus':
          return studySnapshot.ref;
        case 'left_workbench':
          // Extract ref string from BookshelfItem if needed
          const leftRef = studySnapshot.workbench?.left;
          return typeof leftRef === 'string' ? leftRef : leftRef?.ref;
        case 'right_workbench':
          // Extract ref string from BookshelfItem if needed
          const rightRef = studySnapshot.workbench?.right;
          return typeof rightRef === 'string' ? rightRef : rightRef?.ref;
        default:
          return studySnapshot.ref;
      }
    }
    
    // If no panel selected (Girsa mode), use discussion focus or main ref
    return studySnapshot.discussion_focus_ref || studySnapshot.ref;
  };

  const {
    isActive: isStudyActive,
    isLoading: isLoadingStudy,
    studySessionId,
    studySnapshot,
    startStudy,
    loadStudySession,
    exitStudy,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    isBackgroundLoading,
    workbenchSet,
    workbenchFocus,
    focusMainText,
    navigateToRef,
    refreshStudySnapshot,
  } = useStudyMode();

  const {
    chats,
    isLoading: isLoadingChats,
    error: chatsError,
    messages,
    isLoadingMessages,
    selectedChatId,
    selectChat,
    createChat,
    sendMessage,
    isSending,
    deleteSession,
  } = useChat(agentId, urlChatId);


  useTextSelectionListener();

  // Function to load daily session as study mode
  const loadDailyAsStudy = async (dailySessionId: string) => {
    try {
      console.log('📖 Loading daily session as study:', dailySessionId);
      
      // Get daily session details
      const response = await fetch(`/api/sessions/${dailySessionId}`);
      if (!response.ok) {
        console.error('Failed to get daily session:', response.status);
        return;
      }
      
      const dailySession = await response.json();
      const textRef = dailySession.ref;
      
      if (textRef) {
        console.log('Starting study with ref:', textRef, 'and daily session ID:', dailySessionId);
        // Start study mode with the calendar text using the existing daily session ID
        await startStudy(textRef, dailySessionId);
      } else {
        console.error('No ref found in daily session:', dailySession);
      }
    } catch (error) {
      console.error('Failed to load daily session as study:', error);
    }
  };

  useEffect(() => {
    // If the URL is a study session URL, automatically load it.
    if (location.pathname.startsWith('/study/') && urlChatId) {
      loadStudySession(urlChatId);
    }
    
    // If the URL is a daily session URL, automatically load it as study.
    if (location.pathname.startsWith('/daily/') && urlChatId) {
      loadDailyAsStudy(urlChatId);
    }
  }, [location.pathname, urlChatId, loadStudySession, startStudy]);

  useEffect(() => {
    localStorage.setItem("astra_agent_id", agentId);
  }, [agentId]);

  useEffect(() => {
    if (studySnapshot && studySnapshot.chat_local) {
      // Only update messages if they're different to avoid overwriting local changes
      const snapshotMessages = studySnapshot.chat_local;
      if (JSON.stringify(snapshotMessages) !== JSON.stringify(studyMessages)) {
        // Only update if we have fewer messages locally (avoid overwriting new messages)
        if (studyMessages.length <= snapshotMessages.length) {
          setStudyMessages(snapshotMessages);
        }
      }
    }
  }, [studySnapshot, studyMessages]);

  const handleStartStudy = (textRef: string) => {
    startStudy(textRef).then((newSessionId) => {
      if (newSessionId) {
        navigate(`/study/${newSessionId}`);
      }
      setIsStudySetupOpen(false);
    }).catch((error) => {
      console.error('Failed to create study session:', error);
    });
  };

  const handleSelectSession = async (sessionId: string, type: 'chat' | 'study' | 'daily') => {
    console.log('🖱️ Chat clicked:', { sessionId, type });
    
    if (type === 'study') {
      // Just navigate. The useEffect hook will handle loading the session.
      navigate(`/study/${sessionId}`);
    } else if (type === 'daily') {
      // Lazy create daily session if needed, then navigate
      try {
        console.log('📅 Creating daily session:', sessionId);
        const created = await api.createDailySessionLazy(sessionId);
        console.log('📅 Daily session created:', created);
        
        console.log('🧭 Navigating to:', `/daily/${sessionId}`);
        navigate(`/daily/${sessionId}`);
      } catch (error) {
        console.error('❌ Failed to create daily session:', error);
      }
    } else {
      selectChat(sessionId);
    }
  };

  const handleWorkbenchDrop = async (side: 'left' | 'right', ref: string, dragData?: {
    type: 'single' | 'group' | 'part';
    data?: any;
  }) => {
    try {
      console.log('ChatLayout: handleWorkbenchDrop:', side, ref, dragData);
      
      if (dragData?.type === 'group') {
        console.log('Handling group drop - all refs:', dragData.data?.refs);
        // TODO: Здесь можно добавить специальную логику для групп
        // Например, создать специальный UI для выбора конкретной части
        // Или добавить все части группы последовательно
        
        // Пока что используем первый ref для совместимости
        await workbenchSet(side, ref);
      } else {
        await workbenchSet(side, ref);
      }
    } catch (error) {
      console.error('Failed to handle workbench drop:', error);
    }
  };

  const cols = [];
  if (isSidebarVisible) cols.push('320px');
  if (isChatAreaVisible) cols.push('1fr');
  if (isStudyActive && isChatAreaVisible) cols.push('400px');
  const gridCols = cols.join(' ') || '1fr';

  return (
    <div className="h-screen w-full flex flex-col">
      <TopBar
        agentId={agentId}
        setAgentId={setAgentId}
        onOpenStudy={() => setIsStudySetupOpen(true)}
        onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
        isSidebarVisible={isSidebarVisible}
        onToggleChatArea={() => setIsChatAreaVisible(!isChatAreaVisible)}
        isChatAreaVisible={isChatAreaVisible}
      />

      {/* Main Content Grid */}
      <div
        className="flex-1 min-h-0 grid"
        style={{ gridTemplateColumns: gridCols }}
      >
        {isSidebarVisible && (
          <ChatSidebar
            chats={chats}
            isLoading={isLoadingChats}
            error={chatsError}
            selectedChatId={selectedChatId}
            onSelectChat={handleSelectSession}
            onCreateChat={createChat}
            onDeleteSession={deleteSession}
          />
        )}

        <>
          {isChatAreaVisible && (
            <main className="flex flex-col min-h-0 bg-background">
              {isStudySetupOpen && !isStudyActive && (
                <StudySetupBar
                  onStartStudy={handleStartStudy}
                  onCancel={() => setIsStudySetupOpen(false)}
                  isLoading={isLoadingStudy}
                />
              )}

              <div className="flex-1 min-h-0">
                {isStudyActive ? (
                  <StudyMode
                    snapshot={studySnapshot}
                    onExit={exitStudy}
                    onNavigateBack={navigateBack}
                    onNavigateForward={navigateForward}
                    isLoading={isLoadingStudy}
                    canNavigateBack={canNavigateBack}
                    canNavigateForward={canNavigateForward}
              messages={studyMessages}
              isLoadingMessages={false}
              isSending={studyIsSending}
              studySessionId={studySessionId}
              setIsSending={setStudyIsSending}
              setMessages={setStudyMessages}
              agentId={agentId}
                    onWorkbenchSet={workbenchSet}
                    onWorkbenchFocus={workbenchFocus}
                    onWorkbenchDrop={handleWorkbenchDrop}
                    onFocusClick={focusMainText}
                    onNavigateToRef={navigateToRef}
                    refreshStudySnapshot={refreshStudySnapshot}
                    selectedPanelId={selectedPanelId}
                    onSelectedPanelChange={setSelectedPanelId}
                    isBackgroundLoading={isBackgroundLoading}
                  />
                ) : (
                  <div className="h-full flex flex-col min-h-0">
                    <div className="flex-1 min-h-0">
                      <ChatViewport
                        messages={messages.map(m => ({ ...m, id: String(m.id) }))}
                        isLoading={isLoadingMessages}
                      />
                    </div>
                    <div className="flex-shrink-0">
                      <MessageComposer onSendMessage={sendMessage} disabled={isSending} />
                    </div>
                  </div>
                )}
              </div>
            </main>
          )}
          {isStudyActive && isChatAreaVisible && (
            <div className="min-h-0 overflow-hidden">
              <BookshelfPanel
                sessionId={studySessionId || undefined}
                currentRef={getCurrentRefForBookshelf()}
                onDragStart={(ref) => console.log('Dragging from bookshelf:', ref)}
                onItemClick={(item) => console.log('Clicked bookshelf item:', item)}
              />
            </div>
          )}
        </>
      </div>
    </div>
  );
}