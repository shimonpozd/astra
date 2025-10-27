import React, { useState } from 'react';
import { api } from '../services/api';
import { ResolveResponse } from '../types/study';
import { useNavigate } from 'react-router-dom';

export default function StudyLanding() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCandidates([]);
    setLoading(true);
    try {
      const res: ResolveResponse = await api.resolveRef(query);
      if (res.ok && res.ref) {
        const sessionId = (crypto as any)?.randomUUID?.() || `s_${Date.now()}`;
        // Immediately set focus to bootstrap state
        await api.setFocus(sessionId, res.ref, res.ref);
        navigate(`/study/${encodeURIComponent(sessionId)}`);
      } else {
        setCandidates(res.candidates || []);
        setError(res.message || 'Не удалось однозначно определить ссылку');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка при resolve');
    } finally {
      setLoading(false);
    }
  };

  const chooseCandidate = async (ref: string) => {
    try {
      const sessionId = (crypto as any)?.randomUUID?.() || `s_${Date.now()}`;
      await api.setFocus(sessionId, ref, ref);
      navigate(`/study/${encodeURIComponent(sessionId)}`);
    } catch (err: any) {
      setError(err?.message || 'Ошибка при set_focus');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-2xl bg-card border rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Study Desk</h1>
        <p className="text-sm text-muted-foreground mb-4">Введите ссылку (например, "Shabbat 21a" или "Bereshit 1:1")</p>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 bg-background"
            placeholder="Введите ссылку..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button disabled={loading || !query.trim()} className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">
            {loading ? 'Поиск…' : 'Открыть'}
          </button>
        </form>
        {error && (
          <div className="mt-3 text-sm text-red-500">{error}</div>
        )}
        {candidates.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Возможные варианты:</div>
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <button key={c} onClick={() => chooseCandidate(c)} className="px-3 py-1 rounded border hover:bg-accent text-sm">
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
