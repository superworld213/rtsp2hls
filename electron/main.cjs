const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { initServer } = require("./server/index.cjs");
const { log } = require("./utils/tools.cjs");
const os = require('os');
const eLog = require("electron-log");

// 配置文件日志路径
eLog.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');

// 替换console
Object.assign(console, log.functions);

// 应用状态管理
class AppState {
  constructor() {
    this.isStopStream = false;
    this.streamProcesses = new Map();
    this.mainWindow = null;
  }
}

// 应用状态单例
const appState = new AppState();

// 流处理相关类，管理流转换进程
class StreamManager {
  constructor() {
    this.streamProcesses = appState.streamProcesses;
  }

  getM3u8Dir () {
    return path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "rtsp2hls",
      "m3u8",
    );
  }

  // 启动流转换
  async startStream (config) {
    const { rtspUrl, id, resolution, bitrate, frameRate, audioEnabled } = config;
    log("info", `开始推流: ${rtspUrl}, ${id}`);
    appState.isStopStream = false;

    try {
      const m3u8Dir = this.getM3u8Dir();
      await this.ensureDirectoryExists(m3u8Dir);

      return await new Promise((resolve, reject) => {
        const hlsPath = path.join(m3u8Dir, `./${id}.m3u8`);
        log("info", `HLS 路径: ${hlsPath}`);

        const command = ffmpeg(rtspUrl)
          .inputOptions("-rtsp_transport", "tcp")
          .videoCodec("libx264")
          .outputOptions(
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-crf", "23",
            "-g", "48",
            "-sc_threshold", "0",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_list_size", "10",
            "-hls_flags", "delete_segments",
            "-hls_segment_type", "mpegts",
            "-bufsize", "64k",
            "-maxrate", "4000k",
          );

        // 根据配置动态添加选项
        if (resolution) {
          command.size(resolution);
        }
        if (bitrate) {
          command.videoBitrate(bitrate);
        }
        if (frameRate) {
          command.fps(frameRate);
        }
        if (audioEnabled) {
          command.audioCodec('aac');
        } else {
          command.noAudio();
        }

        command.output(hlsPath)
          .on("start", () => {
            this.streamProcesses.set(id, command);
            this.checkFileExists(hlsPath, id, resolve, reject);
          })
          .on("error", (err) => {
            this.streamProcesses.delete(id);
            log("error", `FFmpeg 错误: ${err.message}`);
            // 发送状态更新到渲染进程
            if (appState.mainWindow) {
              appState.mainWindow.webContents.send('stream-status-changed', { id, status: 'failed', error: err.message });
            }
            reject(new Error(err.message));
          })
          .run();
      });
    } catch (error) {
      log("error", `启动推流失败: ${error}`);
      throw error;
    }
  }

  // 确保目录存在
  async ensureDirectoryExists (dirPath) {
    try {
      await fs.access(dirPath);
      log("info", `目录已存在: ${dirPath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        log("info", `目录不存在，正在创建: ${dirPath}`);
        try {
          await fs.mkdir(dirPath, { recursive: true });
          log("info", `目录创建成功: ${dirPath}`);
        } catch (mkdirError) {
          log("error", `创建目录失败: ${mkdirError.message}`);
          throw mkdirError;
        }
      } else {
        log("error", `访问目录失败: ${error.message}`);
        throw error;
      }
    }
  }

  // 检查文件是否存在，存在则返回相关信息
  checkFileExists (filePath, streamId, resolve, reject, timeout = 0) {
    if (appState.isStopStream) {
      reject("推流已停止");
      return;
    }

    timeout += 1000
    fs.stat(filePath)
      .then((stats) => {
        if (stats.isFile()) {
          resolve({
            streamId,
            hlsUrl: `http://localhost:8080/${streamId}.m3u8`,
          });
        } else {
          if (timeout > 30000) {
            reject("30秒后未找到文件");
            return;
          }
          setTimeout(() => this.checkFileExists(filePath, streamId, resolve, reject, timeout), 1000);
        }
      })
      .catch((error) => {
        if (error.code === "ENOENT") {
          if (timeout > 30000) {
            reject("File not found after 30 seconds");
            return;
          }
          setTimeout(() => this.checkFileExists(filePath, streamId, resolve, reject, timeout), 1000);
          log("info", "文件尚不存在，继续检查...");
        } else {
          log("error", `检查文件时出错: ${error.message}`);
          reject(error.message);
        }
      });
  }

  // 停止单个流
  stopStream (streamId) {
    const process = this.streamProcesses.get(streamId);
    if (process) {
      try {
        log("info", `正在停止推流: ${streamId}`);
        process.kill('SIGKILL'); // 强制终止进程
        this.streamProcesses.delete(streamId);
        log("info", `推流 ${streamId} 已成功停止`);
        if (appState.mainWindow) {
          appState.mainWindow.webContents.send('stream-status-changed', { id: streamId, status: 'stopped' });
        }
      } catch (e) {
        log("error", `停止推流 ${streamId} 时出错: ${e.message}`);
        dialog.showErrorBox("停止推流错误", e.message);
      }
    }
  }

  // 停止所有流
  async stopAllStreams () {
    appState.isStopStream = true;
    const streamIds = Array.from(this.streamProcesses.keys());
    log("info", `正在停止所有推流: ${streamIds.length} 个推流`);

    streamIds.forEach(streamId => this.stopStream(streamId));

    // 等待所有流停止
    await new Promise(resolve => setTimeout(resolve, 500));
    log("info", "所有推流已停止");
  }
}

// 窗口相关类，管理主窗口
class WindowManager {
  constructor() {
    this.mainWindow = appState.mainWindow;
    this.contextMenu = null;
  }

  // 创建主窗口
  async createMainWindow () {
    const isProduction = app.isPackaged;
    const preload = path.join(__dirname, "preload.cjs");
    this.mainWindow = new BrowserWindow({
      width: 1920,
      height: 1080,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: true,
        enableRemoteModule: true,
        backgroundThrottling: false,
        webSecurity: false, // 关闭同源策略
        allowRunningInsecureContent: true, // 允许加载不安全的内容（如 HTTP）
        experimentalFeatures: true // 启用实验特性（可选）
      },
    });

    appState.mainWindow = this.mainWindow;
    Menu.setApplicationMenu(null);

    if (isProduction) {
      await this.mainWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"));
    } else {
      await this.mainWindow.loadURL("http://localhost:5173");
      this.mainWindow.webContents.openDevTools();
    }

    this.setupContextMenu();

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
      appState.mainWindow = null;
    });

    this.mainWindow.on("close", (event) => {
      event.preventDefault();
      this.handleWindowClose();
    });
  }

  // 设置右键菜单
  setupContextMenu () {
    // 创建右键菜单
    this.contextMenu = Menu.buildFromTemplate([
      {
        label: this.getFullscreenLabel(),
        click: () => {
          this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
        },
      },
    ]);

    // 监听全屏状态变化
    this.mainWindow.on("enter-full-screen", () => this.updateFullscreenMenuItem());
    this.mainWindow.on("leave-full-screen", () => this.updateFullscreenMenuItem());

    // 监听右键点击事件
    this.mainWindow.webContents.on("context-menu", (e, params) => {
      // 每次显示菜单前更新标签
      this.updateFullscreenMenuItem();
      this.contextMenu.popup({ window: this.mainWindow });
    });
  }

  // 获取全屏菜单项的正确标签
  getFullscreenLabel () {
    console.log("当前全屏状态:", this.mainWindow.isFullScreen())
    return this.mainWindow.isFullScreen() ? "退出全屏" : "全屏";
  }

  // 更新全屏菜单项
  updateFullscreenMenuItem () {
    console.log(this.contextMenu)
    if (this.contextMenu && this.contextMenu.items[0]) {
      this.contextMenu.items[0].label = this.getFullscreenLabel();
    }
  }

  // 处理窗口关闭
  async handleWindowClose () {
    try {
      log("info", "开始关闭窗口进程...");
      const streamManager = new StreamManager();
      await streamManager.stopAllStreams();
      await this.clearM3u8Folder();

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.destroy();
        this.mainWindow = null;
        appState.mainWindow = null;
      }

      app.quit();
    } catch (error) {
      log("error", `关闭窗口进程时出错: ${error.message}`);
      app.quit();
    }
  }

  // 清空m3u8文件夹
  async clearM3u8Folder () {
    const streamManager = new StreamManager();
    const m3u8Dir = streamManager.getM3u8Dir();

    try {
      await fs.access(m3u8Dir);
      const files = await fs.readdir(m3u8Dir);

      for (const file of files) {
        const filePath = path.join(m3u8Dir, file);
        await fs.unlink(filePath);
      }

      log("info", "m3u8 文件夹已清除");
    } catch (error) {
      // 目录不存在或其他错误
      log("info", "m3u8 文件夹无需清除");
    }
  }
}

// 应用初始化相关类
class AppInitializer {
  constructor() {
    this.streamManager = new StreamManager();
    this.windowManager = new WindowManager();
  }

  // 获取 FFmpeg 路径
  _getFFmpegPath () {
    const isProduction = app.isPackaged;
    if (isProduction) {
      return path.join(
        app.getAppPath(),
        "..",
        "app.asar.unpacked",
        "ffmpeg",
        "bin",
        process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
      );
    } else {
      return path.join(
        __dirname,
        "..",
        "ffmpeg",
        "bin",
        process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
      );
    }
  }

  // 设置FFmpeg路径
  async setFFmpegPath () {
    const ffmpegPath = this._getFFmpegPath();
    try {
      await fs.access(ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
      log("info", `FFmpeg 路径设置成功: ${ffmpegPath}`);
      return ffmpegPath;
    } catch (err) {
      log("error", `设置 FFmpeg 路径时出错: ${err.message}`);
      throw new Error(`未找到 FFmpeg: ${ffmpegPath}`);
    }
  }

  // 处理单实例逻辑
  setTheLock () {
    const additionalData = { myKey: "myValue" };
    const gotTheLock = app.requestSingleInstanceLock(additionalData);

    if (!gotTheLock) {
      log("info", "应用程序已在运行。正在退出。");
      app.quit();
      return false;
    }

    app.on(
      "second-instance",
      (event, commandLine, workingDirectory, additionalData) => {
        log(
          "info",
          `从第二个实例接收到数据: ${JSON.stringify(additionalData)}`,
        );

        if (this.windowManager.mainWindow) {
          if (this.windowManager.mainWindow.isMinimized())
            this.windowManager.mainWindow.restore();
          this.windowManager.mainWindow.focus();
        }
      },
    );

    return true;
  }

  // 初始化服务器
  async initServer () {
    try {
      await initServer();
      log("info", "服务器初始化成功");
    } catch (error) {
      log("error", `服务器初始化失败: ${error.message}`);
      throw error;
    }
  }

  // 初始化应用
  async init () {
    if (!this.setTheLock()) {
      return;
    }

    try {
      await this.setFFmpegPath();

      // 确保m3u8目录存在
      const streamManager = new StreamManager();
      await streamManager.ensureDirectoryExists(streamManager.getM3u8Dir());

      // 等待应用准备就绪
      await app.whenReady();
      app.whenReady().then(async () => {
        try {
          await this.initServer();
          await this.windowManager.createMainWindow();
          this.setupIpcHandlers();
          log("info", "应用初始化成功");
        } catch (error) {
          log("error", `应用初始化出错: ${error.message}`);
          app.quit();
        }
      });

    } catch (error) {
      log("error", `应用程序初始化错误: ${error.message}`);
      app.quit();
    }
  }

  // 设置IPC通信处理函数
  setupIpcHandlers () {
    // 流管理相关
    ipcMain.handle("start-stream", async (event, { rtspUrl, id }) => {
      return this.streamManager.startStream(rtspUrl, id);
    });

    ipcMain.handle("stop-stream", (event, id) => {
      this.streamManager.stopStream(id);
    });

    ipcMain.handle("stop-all-stream", async () => {
      await this.streamManager.stopAllStreams();
    });

    // FFmpeg 流管理
    ipcMain.handle("start-ffmpeg-stream", async (event, config) => {
      try {
        const result = await this.streamManager.startStream(config);
        return { success: true, ...result };
      } catch (error) {
        log("error", `启动 FFmpeg 流失败: ${error.message}`);
        return Promise.reject(new Error(error.message));
      }
    });

    ipcMain.handle("stop-ffmpeg-stream", (event, id) => {
      this.streamManager.stopStream(id);
      return { success: true };
    });

    ipcMain.handle("get-ffmpeg-status", (event, id) => {
      const process = this.streamManager.streamProcesses.get(id);
      return {
        id,
        running: !!process,
        url: process ? `http://localhost:8080/${id}.m3u8` : null
      };
    });

    ipcMain.handle("get-all-ffmpeg-status", () => {
      const statuses = [];
      for (const [id, process] of this.streamManager.streamProcesses.entries()) {
        statuses.push({
          id,
          running: !!process,
          url: `http://localhost:8080/${id}.m3u8`
        });
      }
      return statuses;
    });

    // FFmpeg 错误处理
    ipcMain.handle("get-ffmpeg-error", (event, id) => {
      // 返回空错误，因为当前实现中错误直接抛出
      return null;
    });

    ipcMain.handle("clear-ffmpeg-error", (event, id) => {
      // 清除错误（当前实现中无需操作）
      return true;
    });

    // HTTP 服务器信息
    ipcMain.handle("get-http-server-info", () => {
      return {
        port: 8080,
        baseUrl: "http://localhost:8080",
        running: true
      };
    });

    // 系统信息相关
    ipcMain.handle("get-system-info", async () => {
      const os = require('os');
      const ffmpegCheck = this.checkFFmpegAvailability();
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

    // FFmpeg检查
    ipcMain.handle("check-ffmpeg", async () => {
      log("info", "检查FFmpeg");
      return this.checkFFmpegAvailability();
    });

    // 文件系统操作
    ipcMain.handle("check-file-exists", async (event, filePath) => {
      try {
        await fs.access(filePath);
        return true;
      } catch (error) {
        return false;
      }
    });

    ipcMain.handle("create-directory", async (event, dirPath) => {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 窗口相关
    ipcMain.handle("get-fullscreen-status", () => {
      return this.windowManager.mainWindow?.isFullScreen() || false;
    });

    // 流URL获取
    ipcMain.handle("get-stream-url", async (event, streamId) => {
      return {
        url: `http://localhost:8080/${streamId}.m3u8`,
        baseUrl: "http://localhost:8080"
      };
    });
  }

  // 检查FFmpeg是否可用
  checkFFmpegAvailability () {
    const { execSync } = require('child_process');
    const ffmpegPath = this._getFFmpegPath();
    try {
      // 首先检查本地FFmpeg文件是否存在
      if (require('fs').existsSync(ffmpegPath)) {
        execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
        return { available: true, usingLocal: true, path: ffmpegPath };
      }

      // 如果本地FFmpeg不存在，尝试系统PATH中的FFmpeg
      execSync('ffmpeg -version', { stdio: 'ignore' });
      return { available: true, usingLocal: false, path: 'ffmpeg' };
    } catch (error) {
      return {
        available: false,
        error: '未找到 FFmpeg。请确保 FFmpeg 位于项目的 ffmpeg/bin 目录中或已安装在系统 PATH 中。'
      };
    }
  }
}

// 主程序入口
const appInitializer = new AppInitializer();
appInitializer.init();

// 处理强制退出场景（如程序崩溃）
process.on("SIGINT", async () => {
  try {
    const streamManager = new StreamManager();
    await streamManager.stopAllStreams();
    const windowManager = new WindowManager();
    await windowManager.clearM3u8Folder();
  } catch (error) {
    log("error", `程序退出清理失败: ${error.message}`);
  } finally {
    process.exit();
  }
});

process.on("SIGTERM", async () => {
  try {
    const streamManager = new StreamManager();
    await streamManager.stopAllStreams();
    const windowManager = new WindowManager();
    await windowManager.clearM3u8Folder();
  } catch (error) {
    log("error", `Program exit cleanup failed: ${error.message}`);
  } finally {
    process.exit();
  }
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    try {
      const streamManager = new StreamManager();
      await streamManager.stopAllStreams();
      app.quit();
    } catch (error) {
      log("error", `关闭所有窗口时出错: ${error.message}`);
      app.quit();
    }
  }
});