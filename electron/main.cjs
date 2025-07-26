const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { execSync } = require('child_process');
const http = require('http');

// FFmpeg进程管理
const ffmpegProcesses = new Map();
const ffmpegErrors = new Map(); // 存储FFmpeg错误信息

// HTTP服务器配置
let httpServer = null;
const HTTP_PORT = 8080;
const OUTPUT_DIR = path.join(__dirname, '../output');

// 启动HTTP服务器
function startHttpServer() {
  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  httpServer = http.createServer((req, res) => {
    // 设置CORS头部
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 处理API请求
    if (req.url.startsWith('/api/')) {
      handleApiRequest(req, res);
      return;
    }

    // 处理HLS文件请求
    let filePath;
    if (req.url.startsWith('/hls/')) {
      // 移除/hls/前缀
      const fileName = req.url.substring(5);
      filePath = path.join(OUTPUT_DIR, fileName);
    } else {
      // 直接访问文件
      filePath = path.join(OUTPUT_DIR, req.url);
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code == 'ENOENT') {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(500);
          res.end('Server error');
        }
      } else {
        let contentType = 'text/plain';
        if (filePath.endsWith('.m3u8')) {
          contentType = 'application/vnd.apple.mpegurl';
        } else if (filePath.endsWith('.ts')) {
          contentType = 'video/mp2t';
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  }).listen(HTTP_PORT, () => {
    console.log(`HTTP服务器已启动，端口: ${HTTP_PORT}`);
    console.log(`HLS文件访问地址: http://localhost:${HTTP_PORT}/hls/`);
    console.log(`API端点: http://localhost:${HTTP_PORT}/api/`);
  });

  httpServer.on('error', (error) => {
    console.error('HTTP服务器启动失败:', error);
  });
}

// 获取本地FFmpeg路径
function getFFmpegPath() {
  const ffmpegPath = path.join(__dirname, '../ffmpeg/bin/ffmpeg.exe');
  return ffmpegPath;
}

// 检查FFmpeg是否可用
function checkFFmpegAvailability() {
  try {
    const ffmpegPath = getFFmpegPath();
    // 首先检查本地FFmpeg文件是否存在
    if (fs.existsSync(ffmpegPath)) {
      execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
      return { available: true, usingLocal: true, path: ffmpegPath };
    }
    
    // 如果本地FFmpeg不存在，尝试系统PATH中的FFmpeg
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return { available: true, usingLocal: false, path: 'ffmpeg' };
  } catch (error) {
    return { 
      available: false, 
      error: 'FFmpeg未找到。请确保FFmpeg在项目的public/ffmpeg/bin目录中，或安装到系统PATH中。'
    };
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/favicon.svg')
  });

  // 开发环境加载本地服务器，生产环境加载打包文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.webContents.openDevTools();
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  startHttpServer();
});

// 应用退出前的清理工作
app.on('before-quit', (event) => {
  console.log('应用即将退出，正在清理资源...');
  
  // 阻止默认退出行为，先进行清理
  event.preventDefault();
  
  // 清理所有FFmpeg进程
  killAllFFmpegProcesses();
  
  // 关闭HTTP服务器
  if (httpServer) {
    httpServer.close(() => {
      console.log('HTTP服务器已关闭');
      // 清理完成后真正退出应用
      app.exit(0);
    });
  } else {
    // 如果没有HTTP服务器，直接退出
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 处理进程信号，确保在强制退出时也能清理资源
process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在清理资源...');
  killAllFFmpegProcesses();
  if (httpServer) {
    httpServer.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在清理资源...');
  killAllFFmpegProcesses();
  if (httpServer) {
    httpServer.close();
  }
  process.exit(0);
});

// Windows系统的关闭信号
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => {
    console.log('收到SIGBREAK信号，正在清理资源...');
    killAllFFmpegProcesses();
    if (httpServer) {
      httpServer.close();
    }
    process.exit(0);
  });
}

// 清理output目录中的缓存文件
function cleanOutputCache() {
  try {
    console.log('正在清理output目录缓存文件...');
    
    if (fs.existsSync(OUTPUT_DIR)) {
      const files = fs.readdirSync(OUTPUT_DIR);
      let deletedCount = 0;
      
      files.forEach(file => {
        const filePath = path.join(OUTPUT_DIR, file);
        const ext = path.extname(file).toLowerCase();
        
        // 删除.m3u8和.ts文件
        if (ext === '.m3u8' || ext === '.ts') {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`已删除缓存文件: ${file}`);
          } catch (error) {
            console.error(`删除文件 ${file} 时出错:`, error);
          }
        }
      });
      
      console.log(`缓存清理完成，共删除 ${deletedCount} 个文件`);
    } else {
      console.log('output目录不存在，无需清理');
    }
  } catch (error) {
    console.error('清理output缓存时出错:', error);
  }
}

// FFmpeg进程管理函数
function killAllFFmpegProcesses() {
  console.log(`正在关闭 ${ffmpegProcesses.size} 个FFmpeg进程...`);
  
  ffmpegProcesses.forEach((process, id) => {
    try {
      if (process && !process.killed) {
        console.log(`正在关闭FFmpeg进程: ${id}`);
        
        // 首先尝试优雅关闭
        process.kill('SIGTERM');
        
        // 设置超时强制关闭
        setTimeout(() => {
          if (process && !process.killed) {
            console.log(`强制关闭FFmpeg进程: ${id}`);
            process.kill('SIGKILL');
          }
        }, 3000); // 3秒后强制关闭
      }
    } catch (error) {
      console.error(`关闭FFmpeg进程 ${id} 时出错:`, error);
    }
  });
  
  // 清空进程映射和错误信息
  ffmpegProcesses.clear();
  ffmpegErrors.clear();
  
  console.log('所有FFmpeg进程清理完成');
  
  // 清理output目录缓存文件
  cleanOutputCache();
}

function killFFmpegProcess(id) {
  const process = ffmpegProcesses.get(id);
  if (process && !process.killed) {
    try {
      process.kill('SIGTERM');
      ffmpegProcesses.delete(id);
      ffmpegErrors.delete(id); // 清理错误信息
      return true;
    } catch (error) {
      console.error(`Error killing FFmpeg process ${id}:`, error);
      return false;
    }
  }
  return false;
}

// IPC处理器
ipcMain.handle('start-ffmpeg-stream', async (event, config) => {
  const { id, rtspUrl, outputDir, options = {} } = config;
  
  // 首先检查FFmpeg是否可用
  const ffmpegCheck = checkFFmpegAvailability();
  if (!ffmpegCheck.available) {
    return { success: false, error: ffmpegCheck.error };
  }
  
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${id}.m3u8`);
    
    // FFmpeg命令参数 - 优化低延时配置
    const ffmpegArgs = [
      // 输入流优化参数
      '-fflags', 'nobuffer+fastseek+flush_packets',
      '-flags', 'low_delay',
      '-probesize', '32',
      '-analyzeduration', '100000', // 0.1秒
      '-max_delay', '0',
      '-rtsp_transport', 'tcp', // 使用TCP传输更稳定
      '-i', rtspUrl,
      // 编码器优化参数
      '-c:v', options.videoCodec || 'libx264',
      '-preset', 'ultrafast', // 最快编码预设
      '-tune', 'zerolatency', // 零延时调优
      '-g', '15', // GOP大小，降低关键帧间隔
      '-keyint_min', '15',
      '-sc_threshold', '0', // 禁用场景切换检测
      '-c:a', options.audioCodec || 'aac',
      '-ac', '2', // 双声道
      '-ar', '44100', // 音频采样率
      // HLS输出优化参数
      '-f', 'hls',
      '-hls_time', options.hlsTime || '1', // 1秒分片
      '-hls_list_size', options.hlsListSize || '3', // 减少播放列表大小
      '-hls_flags', 'delete_segments+independent_segments',
      '-hls_segment_type', 'mpegts',
      '-hls_allow_cache', '0', // 禁用缓存
      '-y', // 覆盖输出文件
      outputPath
    ];

    // 如果指定了分辨率
    if (options.resolution) {
      ffmpegArgs.splice(2, 0, '-s', options.resolution);
    }

    // 如果指定了码率
    if (options.bitrate) {
      ffmpegArgs.splice(2, 0, '-b:v', options.bitrate);
    }

    // 使用检测到的FFmpeg路径
    const ffmpegProcess = spawn(ffmpegCheck.path, ffmpegArgs);
    ffmpegProcesses.set(id, ffmpegProcess);

    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg ${id} stdout:`, data.toString());
    });

    let errorOutput = '';
    let hasStarted = false;
    let errorType = null;
    let errorMessage = '';
    
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.log(`FFmpeg ${id} stderr:`, output);
      errorOutput += output;
      
      // 检查是否成功开始处理
      if (output.includes('Opening') || output.includes('Stream mapping') || output.includes('Press [q] to stop')) {
        hasStarted = true;
        // 清除之前的错误信息，因为进程已经成功启动
        ffmpegErrors.delete(id);
      }
      
      // 检查常见错误并分类
      if (output.includes('Connection refused') || output.includes('Connection timed out')) {
        errorType = 'connection';
        errorMessage = 'RTSP服务器无法连接，请检查URL和网络连接';
        console.error(`FFmpeg ${id} connection error: RTSP server unreachable`);
      } else if (output.includes('Invalid data found') || output.includes('Protocol not found')) {
        errorType = 'protocol';
        errorMessage = 'RTSP URL无效或协议不支持';
        console.error(`FFmpeg ${id} protocol error: Invalid RTSP URL or unsupported protocol`);
      } else if (output.includes('No such file or directory')) {
        errorType = 'file';
        errorMessage = '输出目录不可访问';
        console.error(`FFmpeg ${id} file error: Output directory not accessible`);
      } else if (output.includes('Server returned 401 Unauthorized') || output.includes('401 Unauthorized')) {
        errorType = 'auth';
        errorMessage = 'RTSP认证失败，请检查用户名和密码';
      } else if (output.includes('Server returned 404') || output.includes('404 Not Found')) {
        errorType = 'notfound';
        errorMessage = 'RTSP流不存在，请检查URL路径';
      }
      
      // 存储错误信息
      if (errorType && errorMessage) {
        ffmpegErrors.set(id, {
          type: errorType,
          message: errorMessage,
          fullOutput: errorOutput,
          timestamp: new Date().toISOString()
        });
      }
    });

    ffmpegProcess.on('error', (error) => {
      console.error(`FFmpeg process ${id} spawn error:`, error);
      ffmpegProcesses.delete(id);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process ${id} exited with code ${code}`);
      if (code !== 0) {
        if (!hasStarted) {
          console.error(`FFmpeg ${id} failed to start. Error output:`, errorOutput);
          // 如果没有具体的错误类型，设置通用错误
          if (!ffmpegErrors.has(id)) {
            ffmpegErrors.set(id, {
              type: 'unknown',
              message: '视频流启动失败，请检查RTSP URL和网络连接',
              fullOutput: errorOutput,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          console.error(`FFmpeg ${id} stopped unexpectedly with code ${code}`);
          ffmpegErrors.set(id, {
            type: 'runtime',
            message: '视频流运行时出现错误',
            fullOutput: errorOutput,
            timestamp: new Date().toISOString()
          });
        }
      }
      ffmpegProcesses.delete(id);
    });

    return { success: true, outputPath };
  } catch (error) {
    console.error('Error starting FFmpeg:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-ffmpeg-stream', async (event, id) => {
  const result = killFFmpegProcess(id);
  return { success: result };
});

ipcMain.handle('get-ffmpeg-status', async (event, id) => {
  const process = ffmpegProcesses.get(id);
  return {
    running: process && !process.killed,
    pid: process ? process.pid : null
  };
});

ipcMain.handle('get-all-ffmpeg-status', async () => {
  const status = {};
  ffmpegProcesses.forEach((process, id) => {
    status[id] = {
      running: !process.killed,
      pid: process.pid
    };
  });
  return status;
});

// 文件系统操作
ipcMain.handle('check-file-exists', async (event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
});

ipcMain.handle('create-directory', async (event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-system-info', async () => {
  const os = require('os');
  const ffmpegCheck = checkFFmpegAvailability();
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    nodeVersion: process.version,
    ffmpegAvailable: ffmpegCheck.available,
    ffmpegUsingLocal: ffmpegCheck.usingLocal,
    ffmpegPath: ffmpegCheck.path,
    ffmpegError: ffmpegCheck.error
  };
});

// 添加专门的FFmpeg检查接口
ipcMain.handle('check-ffmpeg', async () => {
  return checkFFmpegAvailability();
});

// 获取FFmpeg错误信息
ipcMain.handle('get-ffmpeg-error', async (event, id) => {
  const error = ffmpegErrors.get(id);
  return error || null;
});

// 清除FFmpeg错误信息
ipcMain.handle('clear-ffmpeg-error', async (event, id) => {
  ffmpegErrors.delete(id);
  return { success: true };
});

// 处理API请求
function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  
  if (url.pathname === '/api/streams') {
    try {
      const streams = [];
      if (fs.existsSync(OUTPUT_DIR)) {
        const files = fs.readdirSync(OUTPUT_DIR);
        files.forEach(file => {
          if (file.endsWith('.m3u8')) {
            const streamId = path.basename(file, '.m3u8');
            const streamPath = `/hls/${file}`;
            streams.push({
              id: streamId,
              name: streamId,
              url: `http://localhost:${HTTP_PORT}${streamPath}`,
              path: streamPath
            });
          }
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ streams }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else if (url.pathname.startsWith('/api/stream/')) {
    const id = url.pathname.split('/api/stream/')[1];
    const m3u8Path = path.join(OUTPUT_DIR, `${id}.m3u8`);
    
    if (fs.existsSync(m3u8Path)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id,
        url: `http://localhost:${HTTP_PORT}/hls/${id}.m3u8`,
        available: true
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stream not found' }));
    }
  } else if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: HTTP_PORT }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
  }
}

// 获取HTTP服务器信息
ipcMain.handle('get-http-server-info', async () => {
  return {
    port: HTTP_PORT,
    baseUrl: `http://localhost:${HTTP_PORT}`,
    hlsUrl: `http://localhost:${HTTP_PORT}/hls/`,
    apiUrl: `http://localhost:${HTTP_PORT}/api/`,
    running: httpServer !== null
  };
});

// 获取流的HTTP URL
ipcMain.handle('get-stream-url', async (event, streamId) => {
  return {
    url: `http://localhost:${HTTP_PORT}/hls/${streamId}.m3u8`,
    baseUrl: `http://localhost:${HTTP_PORT}`
  };
});