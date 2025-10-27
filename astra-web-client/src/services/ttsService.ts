interface TTSConfig {
  provider: 'elevenlabs' | 'xtts' | 'openai' | 'yandex' | 'orpheus';
  voiceId?: string;
  language?: string;
  speed?: number;
}

interface Voice {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female';
  description?: string;
}

interface TTSRequest {
  text: string;
  voiceId?: string;
  language?: string;
  speed?: number;
}

// Import AudioMessage type
import type { AudioMessage, AudioContent } from '../types/text';

class TTSService {
  private audioContext: AudioContext | null = null;
  private currentAudio: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private isPaused = false;
  private currentText = '';
  private config: TTSConfig;
  // simple in-memory cache for voices
  private static voicesCache: { data: Voice[]; loadedAt: number } | null = null;
  private static VOICES_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(config: TTSConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  async synthesize(text: string, options?: Partial<TTSRequest>): Promise<AudioBuffer> {
    await this.initialize();
    
    const request: TTSRequest = {
      text,
      voiceId: options?.voiceId || this.config.voiceId,
      language: options?.language || this.config.language || 'en',
      speed: options?.speed || this.config.speed || 1.0,
    };

    try {
      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          voice_id: request.voiceId,
          language: request.language,
          speed: request.speed,
          provider: this.config.provider,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS synthesis failed: ${response.statusText}`);
      }

      const audioData = await response.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData);
      
      return audioBuffer;
    } catch (error) {
      console.error('TTS synthesis error:', error);
      throw error;
    }
  }

  async play(text: string, options?: Partial<TTSRequest>): Promise<void> {
    try {
      // Stop current playback
      await this.stop();

      // For Yandex, use HTML5 audio element instead of Web Audio API
      if (this.config.provider === 'yandex') {
        const response = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice_id: options?.voiceId || this.config.voiceId,
            language: options?.language || this.config.language || 'en',
            speed: options?.speed || this.config.speed || 1.0,
            provider: this.config.provider,
          }),
        });

        if (!response.ok) {
          throw new Error(`TTS synthesis failed: ${response.statusText}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Create HTML5 audio element
        const audio = new Audio(audioUrl);
        this.currentAudio = audio as any; // Store reference for stop/pause
        
        audio.onended = () => {
          this.isPlaying = false;
          this.isPaused = false;
          this.currentText = '';
          URL.revokeObjectURL(audioUrl);
        };

        await audio.play();
        this.isPlaying = true;
        this.isPaused = false;
        this.currentText = text;

        console.log('🎵 TTS playback started (HTML5):', { text: text.substring(0, 50) + '...' });
      } else {
        // Use Web Audio API for other providers
        const audioBuffer = await this.synthesize(text, options);
        
        // Create audio source
        this.currentAudio = this.audioContext!.createBufferSource();
        this.currentAudio.buffer = audioBuffer;
        this.currentAudio.connect(this.audioContext!.destination);

        // Set up event handlers
        this.currentAudio.onended = () => {
          this.isPlaying = false;
          this.isPaused = false;
          this.currentText = '';
        };

        // Start playback
        this.currentAudio.start();
        this.isPlaying = true;
        this.isPaused = false;
        this.currentText = text;

        console.log('🎵 TTS playback started (Web Audio):', { text: text.substring(0, 50) + '...' });
      }
    } catch (error) {
      console.error('TTS playback error:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.currentAudio) {
      try {
        if (this.config.provider === 'yandex' && this.currentAudio.pause) {
          // HTML5 audio element
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
        } else {
          // Web Audio API
          this.currentAudio.stop();
        }
      } catch (error) {
        // Audio might already be stopped
      }
      this.currentAudio = null;
    }
    
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    
    console.log('⏹️ TTS playback stopped');
  }

  async pause(): Promise<void> {
    if (this.config.provider === 'yandex' && this.currentAudio && this.currentAudio.pause) {
      // HTML5 audio element
      this.currentAudio.pause();
      this.isPaused = true;
      console.log('⏸️ TTS playback paused (HTML5)');
    } else if (this.audioContext && this.audioContext.state === 'running') {
      // Web Audio API
      await this.audioContext.suspend();
      this.isPaused = true;
      console.log('⏸️ TTS playback paused (Web Audio)');
    }
  }

  async resume(): Promise<void> {
    if (this.config.provider === 'yandex' && this.currentAudio && this.currentAudio.play) {
      // HTML5 audio element
      await this.currentAudio.play();
      this.isPaused = false;
      console.log('▶️ TTS playback resumed (HTML5)');
    } else if (this.audioContext && this.audioContext.state === 'suspended') {
      // Web Audio API
      await this.audioContext.resume();
      this.isPaused = false;
      console.log('▶️ TTS playback resumed (Web Audio)');
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      const now = Date.now();
      if (TTSService.voicesCache && (now - TTSService.voicesCache.loadedAt) < TTSService.VOICES_TTL_MS) {
        return TTSService.voicesCache.data;
      }
      const response = await fetch('/api/tts/voices', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get voices: ${response.statusText}`);
      }

      const payload = await response.json();
      const voices: Voice[] = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.voices) ? payload.voices : []);
      // cache result
      TTSService.voicesCache = { data: voices, loadedAt: now };
      return voices;
    } catch (error) {
      console.error('Failed to get voices:', error);
      return [];
    }
  }

  // Getters
  get playing(): boolean {
    return this.isPlaying;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get text(): string {
    return this.currentText;
  }

  // Configuration
  setConfig(config: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSConfig {
    return { ...this.config };
  }

  /**
   * Synthesize audio and create an audio message for chat
   */
  async synthesizeAndCreateMessage(
    text: string, 
    options?: Partial<TTSRequest>
  ): Promise<AudioMessage> {
    try {
      // 1. Synthesize audio
      const audioBuffer = await this.synthesize(text, options);
      
      // 2. Convert AudioBuffer to Blob
      const audioBlob = await this.audioBufferToBlob(audioBuffer);
      
      // 3. Create object URL
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // 4. Get file size
      const size = audioBlob.size;
      
      // 5. Determine format based on provider
      const format = this.getAudioFormat();
      
      // 6. Create audio content
      const audioContent: AudioContent = {
        text,
        audioUrl,
        duration: audioBuffer.duration,
        provider: this.config.provider,
        voiceId: options?.voiceId || this.config.voiceId,
        format,
        size,
      };
      
      // 7. Create audio message
      const audioMessage: AudioMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content_type: 'audio.v1',
        content: audioContent,
        timestamp: Date.now(),
      };
      
      console.log('🎵 Audio message created:', {
        id: audioMessage.id,
        duration: audioBuffer.duration,
        size: `${(size / 1024).toFixed(1)} KB`,
        provider: this.config.provider,
      });
      
      return audioMessage;
    } catch (error) {
      console.error('Failed to create audio message:', error);
      throw error;
    }
  }

  /**
   * Convert AudioBuffer to Blob
   */
  private async audioBufferToBlob(audioBuffer: AudioBuffer): Promise<Blob> {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    
    // Create WAV file
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Get audio format based on provider
   */
  private getAudioFormat(): string {
    switch (this.config.provider) {
      case 'elevenlabs':
        return 'mp3';
      case 'yandex':
        return 'ogg';
      case 'xtts':
        return 'wav';
      case 'orpheus':
        return 'wav';
      default:
        return 'wav';
    }
  }

  /**
   * Save audio message to chat via backend API
   */
  async saveAudioMessage(audioMessage: AudioMessage, chatId: string): Promise<void> {
    try {
      console.log('💾 Saving audio message to chat:', { 
        messageId: audioMessage.id, 
        chatId 
      });

      // Convert blob URL to file for upload
      const response = await fetch(audioMessage.content.audioUrl);
      const audioBlob = await response.blob();
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('file', audioBlob, `audio-${audioMessage.id}.${audioMessage.content.format || 'wav'}`);
      
      // Upload audio file
      const uploadResponse = await fetch('/api/audio/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload audio: ${uploadResponse.statusText}`);
      }
      
      const uploadResult = await uploadResponse.json();
      
      // Update audio URL to point to server
      audioMessage.content.audioUrl = uploadResult.url;
      
      // Save message to chat via backend
      const messageResponse = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          message: audioMessage,
        }),
      });
      
      if (!messageResponse.ok) {
        throw new Error(`Failed to save message: ${messageResponse.statusText}`);
      }
      
      console.log('✅ Audio message saved successfully');
    } catch (error) {
      console.error('Failed to save audio message:', error);
      throw error;
    }
  }
}

// Create singleton instance
let ttsServiceInstance: TTSService | null = null;

export function getTTSService(config?: TTSConfig): TTSService {
  if (!ttsServiceInstance) {
    // Если конфигурация не передана, создаем сервис без провайдера
    // Провайдер будет установлен из админ панели
    ttsServiceInstance = new TTSService(config || {
      provider: 'yandex', // Временное значение, будет переопределено из админ панели
      language: 'he',
      speed: 1.0,
    });
  }
  return ttsServiceInstance;
}

export type { TTSConfig, Voice, TTSRequest };
export { TTSService };



