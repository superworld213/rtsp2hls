export interface StreamConfig {
  id: string;
  name: string;
  rtspUrl: string;
  username?: string;
  password?: string;
  resolution: string;
  bitrate: string;
  frameRate: number;
  audioEnabled: boolean;
  status: 'stopped' | 'starting' | 'running' | 'error';
  createdAt: Date;
  updatedAt: Date;
  fixed?: boolean | string;
}

export interface StreamStatus {
  id: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  outputPath?: string;
  error?: string;
  startTime?: Date;
  stats?: {
    duration: string;
    bitrate: string;
    fps: string;
    resolution: string;
  };
}

export interface AppSettings {
  outputDirectory: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoStart: boolean;
  maxConcurrentStreams: number;
  hlsSegmentDuration: number;
  hlsPlaylistSize: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  outputDirectory: './output',
  logLevel: 'info',
  autoStart: false,
  maxConcurrentStreams: 5,
  hlsSegmentDuration: 10,
  hlsPlaylistSize: 6
};

export const RESOLUTION_OPTIONS = [
  { label: '1920x1080 (1080p)', value: '1920x1080' },
  { label: '1280x720 (720p)', value: '1280x720' },
  { label: '854x480 (480p)', value: '854x480' },
  { label: '640x360 (360p)', value: '640x360' },
  { label: '原始分辨率', value: 'original' }
];

export const BITRATE_OPTIONS = [
  { label: '8000k (高质量)', value: '8000k' },
  { label: '4000k (中等质量)', value: '4000k' },
  { label: '2000k (标准质量)', value: '2000k' },
  { label: '1000k (低质量)', value: '1000k' },
  { label: '500k (极低质量)', value: '500k' }
];

export const FRAME_RATE_OPTIONS = [
  { label: '30 FPS', value: 30 },
  { label: '25 FPS', value: 25 },
  { label: '20 FPS', value: 20 },
  { label: '15 FPS', value: 15 },
  { label: '10 FPS', value: 10 }
];