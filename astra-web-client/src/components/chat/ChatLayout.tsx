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

  useEffect(() => {
    // If the URL is a study session URL, automatically load it.
    if (location.pathname.startsWith('/study/') && urlChatId) {
      loadStudySession(urlChatId);
    }
  }, [location.pathname, urlChatId, loadStudySession]);

  useEffect(() => {
    localStorage.setItem("astra_agent_id", agentId);
  }, [agentId]);

  useEffect(() => {
    if (studySnapshot && studySnapshot.chat_local) {
      setStudyMessages(studySnapshot.chat_local);
    }
  }, [studySnapshot]);

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

  const handleSelectSession = (sessionId: string, type: 'chat' | 'study') => {
    if (type === 'study') {
      // Just navigate. The useEffect hook will handle loading the session.
      navigate(`/study/${sessionId}`);
    } else {
      selectChat(sessionId);
    }
  };

  const handleWorkbenchDrop = async (side: 'left' | 'right', ref: string) => {
    try {
      await workbenchSet(side, ref);
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
            <main className="flex flex-col min-h-0" style={{ backgroundColor: '#262624' }}>
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
                    onWorkbenchSet={workbenchSet}
                    onWorkbenchFocus={workbenchFocus}
                    onWorkbenchDrop={handleWorkbenchDrop}
                    onFocusClick={focusMainText}
                    onNavigateToRef={navigateToRef}
                    refreshStudySnapshot={refreshStudySnapshot}
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
                currentRef={studySnapshot?.discussion_focus_ref || studySnapshot?.ref}
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