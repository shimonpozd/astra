import React, { useState, useEffect } from 'react';
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

interface PersonaSelectorProps {
  selected: string;
  onSelect: (persona: string) => void;
}

export default function PersonaSelector({ selected, onSelect }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<{[key: string]: Persona}>({});
  const [loading, setLoading] = useState(true);

  const loadPersonas = () => {
    setLoading(true);
    fetch(`/admin/personalities?t=${Date.now()}`) // Use the new API endpoint
      .then(res => res.json())
      .then((data: Persona[]) => {
        // Transform the array into a key-value object
        const personasObject = data.reduce((acc, persona) => {
          acc[persona.id] = persona;
          return acc;
        }, {} as {[key: string]: Persona});
        setPersonas(personasObject);
        setLoading(false);
        console.log('✅ Персоны загружены через API:', Object.keys(personasObject));
      })
      .catch(err => {
        console.error('❌ Error loading personas from API:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadPersonas();
  }, []);

  return (
    <Select value={selected} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Выберите персону" />
      </SelectTrigger>
      <SelectContent>
        {loading ? (
          <SelectItem value="loading" disabled>Загрузка...</SelectItem>
        ) : (
          Object.entries(personas).map(([key, persona]) => (
            <SelectItem key={key} value={key}>
              {persona.name || key}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}