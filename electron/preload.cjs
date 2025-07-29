const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // FFmpeg流管理
  startFFmpegStream: (config) => ipcRenderer.invoke('start-ffmpeg-stream', config),
  stopFFmpegStream: (id) => ipcRenderer.invoke('stop-ffmpeg-stream', id),
  getFFmpegStatus: (id) => ipcRenderer.invoke('get-ffmpeg-status', id),
  getAllFFmpegStatus: () => ipcRenderer.invoke('get-all-ffmpeg-status'),
  
  // 文件系统操作
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  
  // 系统信息
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  
  // FFmpeg错误处理
  getFFmpegError: (id) => ipcRenderer.invoke('get-ffmpeg-error', id),
  clearFFmpegError: (id) => ipcRenderer.invoke('clear-ffmpeg-error', id),
  
  // HTTP服务器相关
  getHttpServerInfo: () => ipcRenderer.invoke('get-http-server-info'),
  getStreamUrl: (streamId) => ipcRenderer.invoke('get-stream-url', streamId),
  
  // 平台信息
  platform: process.platform
});

// 类型定义（用于TypeScript）
window.electronAPI = {
  startFFmpegStream: (config) => Promise.resolve(),
  stopFFmpegStream: (id) => Promise.resolve(),
  getFFmpegStatus: (id) => Promise.resolve(),
  getAllFFmpegStatus: () => Promise.resolve(),
  checkFileExists: (filePath) => Promise.resolve(),
  createDirectory: (dirPath) => Promise.resolve(),
  getSystemInfo: () => Promise.resolve(),
  platform: ''
};
