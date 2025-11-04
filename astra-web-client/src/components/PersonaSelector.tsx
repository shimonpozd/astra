import { useEffect, useMemo, useState } from 'react';

import { authorizedFetch } from '../lib/authorizedFetch';
import { debugLog } from '../utils/debugLogger';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface Persona {
  id: string;
  name: string;
  description: string;
  flow: string;
  system_prompt?: string | string[];
  language?: string;
}

interface PersonaMap {
  [key: string]: Persona;
}

interface PersonaSelectorProps {
  selected: string;
  onSelect: (persona: string) => void;
}

export default function PersonaSelector({ selected, onSelect }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<PersonaMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPersonas = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authorizedFetch(
          `/api/admin/personalities/public?t=${Date.now()}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load personas: ${response.statusText}`);
        }
        const data = (await response.json()) as Persona[];
        if (!isMounted) return;
        const byId = data.reduce<PersonaMap>((acc, persona) => {
          acc[persona.id] = persona;
          return acc;
        }, {});
        setPersonas(byId);
        debugLog('[PersonaSelector] Loaded personas:', Object.keys(byId));
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load personas';
        setError(message);
        debugLog('[PersonaSelector] Failed to load personas', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPersonas();

    return () => {
      isMounted = false;
    };
  }, []);

  const options = useMemo(() => Object.entries(personas), [personas]);

  return (
    <Select value={selected} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Выберите персонажа" />
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <SelectItem value="loading" disabled>
            Загрузка...
          </SelectItem>
        ) : error ? (
          <SelectItem value="error" disabled>
            Ошибка: {error}
          </SelectItem>
        ) : (
          options.map(([key, persona]) => (
            <SelectItem key={key} value={key}>
              {persona.name || key}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
