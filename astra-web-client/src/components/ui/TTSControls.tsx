import { useState } from 'react';
import { Play, Pause, Square, Volume2, Settings, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Slider } from './slider';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { useTTS } from '../../hooks/useTTS';

interface TTSControlsProps {
  text: string;
  onTextChange?: (text: string) => void;
  className?: string;
  showAdvanced?: boolean;
}

export function TTSControls({
  text,
  onTextChange,
  className = '',
  showAdvanced = false,
}: TTSControlsProps) {
  const [speed, setSpeed] = useState(1.0);
  const [language, setLanguage] = useState('en');
  const [showSettings, setShowSettings] = useState(false);
  
  const {
    isPlaying,
    isPaused,
    currentText,
    voices,
    selectedVoice,
    isLoading,
    error,
    play,
    stop,
    pause,
    resume,
    setVoice,
    refreshVoices,
  } = useTTS({
    language,
    speed,
  });

  const isCurrentText = currentText === text;
  const isActive = isCurrentText && (isPlaying || isPaused);

  const handlePlay = async () => {
    if (disabled || isLoading) return;

    try {
      if (isActive) {
        if (isPlaying) {
          await pause();
        } else if (isPaused) {
          await resume();
        } else {
          await stop();
        }
      } else {
        await stop(); // Stop any current playback
        await play(text);
      }
    } catch (err) {
      console.error('TTS controls error:', err);
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch (err) {
      console.error('TTS stop error:', err);
    }
  };

  const handleVoiceChange = (voiceId: string) => {
    setVoice(voiceId);
  };

  const handleSpeedChange = (newSpeed: number[]) => {
    const speedValue = newSpeed[0];
    setSpeed(speedValue);
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
  };

  const handleRefreshVoices = async () => {
    try {
      await refreshVoices();
    } catch (err) {
      console.error('Failed to refresh voices:', err);
    }
  };

  const getPlayButtonIcon = () => {
    if (isLoading) return <Volume2 className="animate-pulse" />;
    if (error) return <Volume2 className="text-red-500" />;
    if (isActive) {
      return isPlaying ? <Pause /> : <Play />;
    }
    return <Play />;
  };

  const getPlayButtonText = () => {
    if (isLoading) return 'Loading...';
    if (error) return 'Error';
    if (isActive) {
      return isPlaying ? 'Pause' : 'Resume';
    }
    return 'Play';
  };

  const disabled = !text.trim() || isLoading;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Controls */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handlePlay}
          disabled={disabled}
          className="flex items-center gap-2"
          size="sm"
        >
          {getPlayButtonIcon()}
          {getPlayButtonText()}
        </Button>

        <Button
          onClick={handleStop}
          disabled={!isActive}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Square />
          Stop
        </Button>

        {showAdvanced && (
          <Button
            onClick={() => setShowSettings(!showSettings)}
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
          >
            <Settings />
            Settings
          </Button>
        )}
      </div>

      {/* Advanced Settings */}
      {showSettings && showAdvanced && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">TTS Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Voice Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <div className="flex gap-2">
                <Select
                  value={selectedVoice || ''}
                  onValueChange={handleVoiceChange}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        <div className="flex items-center gap-2">
                          <span>{voice.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({voice.language})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleRefreshVoices}
                  variant="outline"
                  size="sm"
                  className="px-2"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select
                value={language}
                onValueChange={handleLanguageChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="he">Hebrew</SelectItem>
                  <SelectItem value="ru">Russian</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Speed Control */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Speed: {speed.toFixed(1)}x
              </label>
              <Slider
                value={[speed]}
                onValueChange={handleSpeedChange}
                min={0.5}
                max={2.0}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TTSControls;








