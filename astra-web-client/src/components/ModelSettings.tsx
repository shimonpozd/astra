import React, { useState } from 'react';
import { ModelSettings as ModelSettingsType } from '../types/index';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ModelSettingsProps {
  settings: ModelSettingsType;
  onChange: (settings: ModelSettingsType) => void;
}

// Модели из .env файла
const envModels: Record<string, string> = {
  'ASTRA_MODEL_PLANNER': 'openrouter/deepseek/deepseek-chat',
  'ASTRA_MODEL_CURATOR': 'openrouter/deepseek/deepseek-chat',
  'ASTRA_MODEL_DRAFTER': 'openrouter/deepseek/deepseek-chat',
  'ASTRA_MODEL_SUMMARIZER': 'openrouter/deepseek/deepseek-chat',
  'ASTRA_MODEL_THINKER': 'openrouter/deepseek-chat-v3.1:free',
  'ASTRA_MODEL_WRITER': 'openrouter/deepseek/deepseek-chat'
};

// Роли и их описания
const modelRoles = [
  { key: 'PLANNER', env: 'ASTRA_MODEL_PLANNER', name: 'Планировщик', description: 'Планирование задач' },
  { key: 'CURATOR', env: 'ASTRA_MODEL_CURATOR', name: 'Куратор', description: 'Поиск информации' },
  { key: 'DRAFTER', env: 'ASTRA_MODEL_DRAFTER', name: 'Черновик', description: 'Создание текстов' },
  { key: 'SUMMARIZER', env: 'ASTRA_MODEL_SUMMARIZER', name: 'Суммирование', description: 'Сжатие текстов' },
  { key: 'THINKER', env: 'ASTRA_MODEL_THINKER', name: 'Размышления', description: 'Генерация идей' },
  { key: 'WRITER', env: 'ASTRA_MODEL_WRITER', name: 'Писатель', description: 'Финальный ответ' }
];

export default function ModelSettings({ settings, onChange }: ModelSettingsProps) {
  const [activeTab, setActiveTab] = useState('WRITER');

  const getCurrentModel = (roleKey: string) => {
    const role = modelRoles.find(r => r.key === roleKey);
    return role ? envModels[role.env] : 'openrouter/deepseek/deepseek-chat';
  };

  const getModelInfo = (roleKey: string) => {
    const role = modelRoles.find(r => r.key === roleKey);
    return role || modelRoles[0];
  };

  return (
    <div className="space-y-4">
      {/* Tabs для режимов */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-gray-300">Режимы работы</div>
        <div className="grid grid-cols-2 gap-2">
          {modelRoles.map((role) => (
            <button
              key={role.key}
              onClick={() => setActiveTab(role.key)}
              className={`p-2 text-xs rounded border transition-colors ${
                activeTab === role.key
                  ? 'bg-gray-200 text-gray-900 border-gray-200'
                  : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
              }`}
            >
              <div className="font-medium">{role.name}</div>
              <div className="text-xs opacity-75 mt-1">{role.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Текущая модель для активного режима */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-gray-300">Текущая модель</div>
        <div className="bg-gray-700 p-3 rounded border border-gray-600">
          <div className="text-xs text-gray-400 mb-1">Режим:</div>
          <div className="text-sm text-gray-200 font-medium mb-2">
            {getModelInfo(activeTab).name}
          </div>
          <div className="text-xs text-gray-400 mb-1">Модель:</div>
          <div className="text-sm text-gray-200 font-mono break-all">
            {getCurrentModel(activeTab)}
          </div>
        </div>
      </div>

      {/* Параметры модели */}
      <div className="space-y-4 pt-4 border-t border-gray-700">
        <div className="text-sm font-medium text-gray-300">Параметры</div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-gray-400">Temperature</label>
            <span className="text-xs text-gray-500">{settings.temperature}</span>
          </div>
          <Input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => onChange({
              ...settings,
              temperature: parseFloat(e.target.value)
            })}
            className="w-full"
            style={{accentColor: '#f5f5f5'}}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-gray-400">Max Tokens</label>
            <span className="text-xs text-gray-500">{settings.maxTokens}</span>
          </div>
          <Input
            type="number"
            value={settings.maxTokens}
            onChange={(e) => onChange({
              ...settings,
              maxTokens: parseInt(e.target.value)
            })}
            className="w-full bg-gray-800 border-gray-600 text-gray-200"
            min="100"
            max="4000"
          />
        </div>
      </div>

      {/* Reasoning настройки */}
      <div className="space-y-3 pt-4 border-t border-gray-700">
        <div className="text-sm font-medium text-gray-300">Reasoning</div>
        <div className="bg-gray-700 p-3 rounded border border-gray-600">
          <div className="text-xs text-gray-400 mb-1">Уровень:</div>
          <div className="text-sm text-gray-200">Medium</div>
          <div className="text-xs text-gray-400 mt-2">
            ASTRA_REASONING=medium
          </div>
        </div>
      </div>
    </div>
  );
}