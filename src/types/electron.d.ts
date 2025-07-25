export interface FFmpegConfig {
  id: string;
  rtspUrl: string;
  outputDir: string;
  options?: {
    videoCodec?: string;
    audioCodec?: string;
    resolution?: string;
    bitrate?: string;
    hlsTime?: string;
    hlsListSize?: string;
  };
}

export interface FFmpegStatus {
  running: boolean;
  pid: number | null;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpus: number;
  totalMemory: number;
  freeMemory: number;
  nodeVersion: string;
  ffmpegAvailable: boolean;
  ffmpegUsingLocal?: boolean;
  ffmpegPath?: string;
  ffmpegError?: string;
}

export interface FFmpegCheckResult {
  available: boolean;
  usingLocal?: boolean;
  path?: string;
  error?: string;
}

export interface FFmpegError {
  type: 'connection' | 'protocol' | 'file' | 'auth' | 'notfound' | 'runtime' | 'unknown';
  message: string;
  fullOutput: string;
  timestamp: string;
}

export interface ElectronAPI {
  startFFmpegStream: (config: FFmpegConfig) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  stopFFmpegStream: (id: string) => Promise<{ success: boolean }>;
  getFFmpegStatus: (id: string) => Promise<FFmpegStatus>;
  getAllFFmpegStatus: () => Promise<Record<string, FFmpegStatus>>;
  checkFileExists: (filePath: string) => Promise<boolean>;
  createDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
  getSystemInfo: () => Promise<SystemInfo>;
  checkFFmpeg: () => Promise<FFmpegCheckResult>;
  getFFmpegError: (id: string) => Promise<FFmpegError | null>;
  clearFFmpegError: (id: string) => Promise<{ success: boolean }>;
  getStreamUrl: (streamId: string) => Promise<{ url: string } | null>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}