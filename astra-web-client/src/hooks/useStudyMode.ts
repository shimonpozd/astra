import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { StudySnapshot } from '../types/study';
import { TextSegment } from '../types/text';

export function useStudyMode() {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studySnapshot, setStudySnapshot] = useState<StudySnapshot | null>(null);
  const [canNavigateBack, setCanNavigateBack] = useState(true);
  const [canNavigateForward, setCanNavigateForward] = useState(true);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [segmentPollingInterval, setSegmentPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const startStudy = useCallback(async (textRef: string, existingSessionId?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const sessionId = existingSessionId || crypto.randomUUID();
      setStudySessionId(sessionId);

      const snapshot = await api.setFocus(sessionId, textRef);
      console.log('🔍 API setFocus response:', snapshot);
      setStudySnapshot(snapshot);
      setCanNavigateBack(true);
      setCanNavigateForward(true);
      setIsActive(true);

      // For Daily Mode, start background loading indicator and polling
      if (sessionId.startsWith('daily-')) {
        setIsBackgroundLoading(true);
        
        // Start polling for new segments
        const interval = setInterval(async () => {
          try {
            const segmentsData = await api.getDailySegments(sessionId);
            console.log('📊 Polling segments:', segmentsData.loaded_segments, '/', segmentsData.total_segments);
            
            if (segmentsData.loaded_segments > 0) {
              // Update study snapshot with new segments
              setStudySnapshot(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  segments: segmentsData.segments
                };
              });
              
              // Stop polling if all segments are loaded
              if (segmentsData.loaded_segments >= segmentsData.total_segments) {
                console.log('✅ All segments loaded, stopping polling');
                clearInterval(interval);
                setIsBackgroundLoading(false);
                setSegmentPollingInterval(null);
              }
            }
          } catch (error) {
            console.error('Failed to poll segments:', error);
            // Stop polling on error
            clearInterval(interval);
            setIsBackgroundLoading(false);
            setSegmentPollingInterval(null);
          }
        }, 1000); // Poll every second
        
        setSegmentPollingInterval(interval);
        
        // Stop polling after 30 seconds max
        setTimeout(() => {
          if (interval) {
            clearInterval(interval);
            setIsBackgroundLoading(false);
            setSegmentPollingInterval(null);
          }
        }, 30000);
      }

      return sessionId; // Return the session ID

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start study mode';
      setError(msg);
      console.error(msg, e);
      throw e; // Re-throw the error so the caller can catch it
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exitStudy = useCallback(() => {
    setIsActive(false);
    setStudySnapshot(null);
    setStudySessionId(null);
    setError(null);
    
    // Clear polling interval if exists
    if (segmentPollingInterval) {
      clearInterval(segmentPollingInterval);
      setSegmentPollingInterval(null);
    }
    setIsBackgroundLoading(false);
  }, [segmentPollingInterval]);

  const navigateBack = useCallback(async () => {
    if (!studySessionId) return;
    try {
      setIsLoading(true);
      const snapshot = await api.navigateBack(studySessionId);
      setStudySnapshot(snapshot);
      setCanNavigateBack(true);
      setCanNavigateForward(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to navigate back';
      setError(msg);
      setCanNavigateBack(false);
    } finally {
      setIsLoading(false);
    }
  }, [studySessionId]);

  const navigateForward = useCallback(async () => {
    if (!studySessionId) return;
    try {
      setIsLoading(true);
      const snapshot = await api.navigateForward(studySessionId);
      setStudySnapshot(snapshot);
      setCanNavigateBack(true);
      setCanNavigateForward(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to navigate forward';
      setError(msg);
      setCanNavigateForward(false);
    } finally {
      setIsLoading(false);
    }
  }, [studySessionId]);

  const workbenchSet = useCallback(async (side: 'left' | 'right', ref: string) => {
    if (!studySessionId) return;
    try {
      setIsLoading(true);
      const response = await fetch('/api/study/workbench/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: studySessionId,
          slot: side,
          ref: ref,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to set workbench');
      }
      const result = await response.json();
      if (result.ok && result.state) {
        setStudySnapshot(result.state);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to set workbench';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [studySessionId]);

  const workbenchClear = useCallback(async (side: 'left' | 'right') => {
    if (!studySessionId) return;
    try {
      setIsLoading(true);
      const response = await fetch('/api/study/workbench/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: studySessionId,
          slot: side,
          ref: null,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to clear workbench');
      }
      const result = await response.json();
      if (result?.ok && result?.state) {
        setStudySnapshot(result.state);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to clear workbench';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [studySessionId]);

  const workbenchFocus = useCallback(async (side: 'left' | 'right') => {
    if (!studySessionId) return;
    const ref = side === 'left' ? studySnapshot?.workbench?.left?.ref : studySnapshot?.workbench?.right?.ref;
    if (!ref) return;
    try {
      setIsLoading(true);
      const response = await fetch('/api/study/chat/set_focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: studySessionId,
          ref: ref,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to set focus');
      }
      const result = await response.json();
      if (result.ok && result.state) {
        setStudySnapshot(result.state);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to focus workbench';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [studySessionId, studySnapshot]);

  const focusMainText = useCallback(async () => {
    if (!studySessionId || !studySnapshot?.ref) return;
    try {
      setIsLoading(true);
      const response = await fetch('/api/study/chat/set_focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: studySessionId,
          ref: studySnapshot.ref,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to set focus');
      }
      const result = await response.json();
      if (result.ok && result.state) {
        setStudySnapshot(result.state);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to focus main text';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [studySessionId, studySnapshot]);

  const navigateToRef = useCallback(async (ref: string, segment?: TextSegment) => {
    if (!studySessionId) return;
    
    // Проверяем, есть ли уже этот ref в текущих сегментах
    const isLocalNavigation = studySnapshot?.segments?.some(item => item.ref === ref);

    if (segment && studySnapshot?.segments?.length) {
      setStudySnapshot(prev => {
        if (!prev?.segments) return prev;
        const idx = prev.segments.findIndex(item => item.ref === segment.ref);
        if (idx === -1) return prev;
        return {
          ...prev,
          focusIndex: idx,
          ref: segment.ref,
          discussion_focus_ref: segment.ref,
        };
      });
    }
    
    try {
      // Показываем loading только для новых ref, не для локальной навигации
      if (!isLocalNavigation) {
        setIsLoading(true);
      }
      
      console.log('🧭 NavigateToRef:', { 
        studySessionId, 
        ref, 
        isDaily: studySessionId.startsWith('daily-'),
        isLocalNavigation 
      });
      
      const response = await fetch('/api/study/set_focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: studySessionId,
          ref: ref,
          navigation_type: 'advance',
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to navigate to ref');
      }
      const result = await response.json();
      if (result.ok && result.state) {
        setStudySnapshot(result.state);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to navigate';
      setError(msg);
    } finally {
      // Убираем loading только если мы его показывали
      if (!isLocalNavigation) {
        setIsLoading(false);
      }
    }
  }, [studySessionId, studySnapshot]);

  const loadStudySession = useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const snapshot = await api.getStudyState(sessionId);
      setStudySessionId(sessionId);
      setStudySnapshot(snapshot);
      setCanNavigateBack(true);
      setCanNavigateForward(true);
      setIsActive(true);

      // For Daily Mode, check if all segments are already loaded
      if (sessionId.startsWith('daily-')) {
        try {
          const segmentsData = await api.getDailySegments(sessionId);
          console.log('📊 Existing session segments:', segmentsData.loaded_segments, '/', segmentsData.total_segments);
          
          if (segmentsData.loaded_segments >= segmentsData.total_segments) {
            console.log('✅ All segments already loaded, no polling needed');
            setIsBackgroundLoading(false);
          } else {
            console.log('🔄 Some segments missing, starting polling');
            setIsBackgroundLoading(true);
            
            // Start polling for remaining segments
            const interval = setInterval(async () => {
              try {
                const segmentsData = await api.getDailySegments(sessionId);
                console.log('📊 Polling segments:', segmentsData.loaded_segments, '/', segmentsData.total_segments);
                
                if (segmentsData.loaded_segments > 0) {
                  // Update study snapshot with new segments
                  setStudySnapshot(prev => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      segments: segmentsData.segments
                    };
                  });
                  
                  // Stop polling if all segments are loaded
                  if (segmentsData.loaded_segments >= segmentsData.total_segments) {
                    console.log('✅ All segments loaded, stopping polling');
                    clearInterval(interval);
                    setIsBackgroundLoading(false);
                    setSegmentPollingInterval(null);
                  }
                }
              } catch (error) {
                console.error('Failed to poll segments:', error);
                // Stop polling on error
                clearInterval(interval);
                setIsBackgroundLoading(false);
                setSegmentPollingInterval(null);
              }
            }, 1000);
            
            setSegmentPollingInterval(interval);
            
            // Stop polling after 30 seconds max
            setTimeout(() => {
              if (interval) {
                clearInterval(interval);
                setIsBackgroundLoading(false);
                setSegmentPollingInterval(null);
              }
            }, 30000);
          }
        } catch (error) {
          console.error('Failed to check existing segments:', error);
          setIsBackgroundLoading(false);
        }
      }

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load study session';
      setError(msg);
      console.error(msg, e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStudySnapshot = useCallback(async () => {
    if (!studySessionId) return;
    try {
      const snapshot = await api.getStudyState(studySessionId);
      setStudySnapshot(snapshot);
    } catch (e) {
      console.error("Failed to refresh study snapshot:", e);
    }
  }, [studySessionId]);


  return {
    isActive,
    isLoading,
    error,
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
    workbenchClear,
    workbenchFocus,
    focusMainText,
    navigateToRef,
    refreshStudySnapshot, // Export the new function
  };
}
