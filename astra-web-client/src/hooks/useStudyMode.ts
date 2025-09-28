import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { StudySnapshot } from '../types/study';

export function useStudyMode() {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studySnapshot, setStudySnapshot] = useState<StudySnapshot | null>(null);
  const [canNavigateBack, setCanNavigateBack] = useState(true);
  const [canNavigateForward, setCanNavigateForward] = useState(true);

  const startStudy = useCallback(async (textRef: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const newSessionId = crypto.randomUUID();
      setStudySessionId(newSessionId);

      const snapshot = await api.setFocus(newSessionId, textRef);
      setStudySnapshot(snapshot);
      setCanNavigateBack(true);
      setCanNavigateForward(true);
      setIsActive(true);

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start study mode';
      setError(msg);
      console.error(msg, e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exitStudy = useCallback(() => {
    setIsActive(false);
    setStudySnapshot(null);
    setStudySessionId(null);
    setError(null);
  }, []);

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
    if (!studySessionId || !studySnapshot?.focus?.ref) return;
    try {
      setIsLoading(true);
      const response = await fetch('/api/study/chat/set_focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: studySessionId,
          ref: studySnapshot.focus.ref,
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

  const navigateToRef = useCallback(async (ref: string) => {
    if (!studySessionId) return;
    try {
      setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [studySessionId]);

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

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load study session';
      setError(msg);
      console.error(msg, e);
    } finally {
      setIsLoading(false);
    }
  }, []);


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
    workbenchSet,
    workbenchFocus,
    focusMainText,
    navigateToRef,
  };
}
