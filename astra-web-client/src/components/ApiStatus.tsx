import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Wifi, WifiOff } from 'lucide-react';

interface ApiStatusProps {
  onStatusChange?: (isConnected: boolean) => void;
}

export default function ApiStatus({ onStatusChange }: ApiStatusProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkApiStatus = async () => {
    setIsChecking(true);
    setError(null);

    try {
      // Проверяем доступность API через health endpoint
      // Use same base as api service to avoid mixed origins
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setIsConnected(true);
        onStatusChange?.(true);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('API health check failed:', err);
      setIsConnected(false);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      onStatusChange?.(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Проверяем статус при монтировании
    checkApiStatus();

    // Проверяем статус каждые 30 секунд
    const interval = setInterval(checkApiStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const getStatusDisplay = () => {
    if (isChecking) {
      return {
        icon: <Wifi className="w-4 h-4 animate-pulse" />,
        text: 'Проверка...',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 border-yellow-200'
      };
    }

    if (isConnected === true) {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        text: 'Brain API подключен',
        color: 'text-green-600',
        bgColor: 'bg-green-50 border-green-200'
      };
    }

    if (isConnected === false) {
      return {
        icon: <WifiOff className="w-4 h-4" />,
        text: 'Brain API недоступен',
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200'
      };
    }

    return {
      icon: <Wifi className="w-4 h-4" />,
      text: 'Проверка статуса...',
      color: 'text-gray-500',
      bgColor: 'bg-gray-50 border-gray-200'
    };
  };

  const status = getStatusDisplay();

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${status.bgColor}`}>
      <div className={status.color}>
        {status.icon}
      </div>
      <span className={status.color}>
        {status.text}
      </span>
      {error && (
        <div className="ml-2">
          <button
            onClick={() => setError(null)}
            className="text-gray-400 hover:text-gray-600"
            title="Скрыть ошибку"
          >
            <AlertCircle className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}