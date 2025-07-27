const { app, BrowserWindow, ipcMain, Menu, dialog, nativeTheme } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { initServer } = require("./server/index");
const os = require("os");

// Log utility function, adds timestamp and distinguishes log levels
const log = (level, message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
};

// Application state management
class AppState {
  constructor() {
    this.isStopStream = false;
    this.streamProcesses = new Map();
    this.mainWindow = null;
  }
}

// Application state singleton
const appState = new AppState();

// Stream processing related class, manages stream conversion processes
class StreamManager {
  constructor() {
    this.streamProcesses = appState.streamProcesses;
  }

  // Get m3u8 directory
  getM3u8Dir() {
    return path.join(
        os.homedir(),
        "AppData",
        "Roaming",
        "smart-granary",
        "m3u8",
    );
  }

  // Start stream conversion
  async startStream(rtspUrl, streamId) {
    appState.isStopStream = false;

    try {
      const m3u8Dir = this.getM3u8Dir();
      await this.ensureDirectoryExists(m3u8Dir);

      return await new Promise((resolve, reject) => {
        const hlsPath = path.join(m3u8Dir, `./${streamId}.m3u8`);
        const command = ffmpeg(rtspUrl)
            .inputOptions("-rtsp_transport", "tcp")
            .videoCodec("libx264")
            .audioCodec("aac")
            .outputOptions(
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-crf", "23",
                "-g", "48",
                "-sc_threshold", "0",
                "-f", "hls",
                "-hls_time", "1",
                "-hls_list_size", "2",
                "-hls_flags", "delete_segments",
                "-hls_segment_type", "mpegts",
                "-bufsize", "64k",
                "-maxrate", "4000k",
            )
            .output(hlsPath)
            .on("start", () => {
              this.streamProcesses.set(streamId, command);
              this.checkFileExists(hlsPath, streamId, resolve, reject);
            })
            .on("error", (err) => {
              this.streamProcesses.delete(streamId);
              reject(err.message);
            })
            .run();
      });
    } catch (error) {
      log("error", `Failed to start stream: ${error.message}`);
      throw error;
    }
  }

  // Ensure directory exists
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      log("info", `Directory created successfully: ${dirPath}`);
    }
  }

  // Check if file exists, return related information if it exists
  checkFileExists(filePath, streamId, resolve, reject) {
    if (appState.isStopStream) {
      reject("Stream stopped");
      return;
    }

    fs.stat(filePath)
        .then((stats) => {
          if (stats.isFile()) {
            resolve({
              streamId,
              hlsUrl: `http://localhost:8080/m3u8/${streamId}.m3u8`,
            });
          } else {
            setTimeout(() => this.checkFileExists(filePath, streamId, resolve, reject), 100);
          }
        })
        .catch((error) => {
          if (error.code === "ENOENT") {
            setTimeout(() => this.checkFileExists(filePath, streamId, resolve, reject), 100);
            log("info", "File does not exist yet, continuing to check...");
          } else {
            log("error", `Error checking file: ${error.message}`);
            reject(error.message);
          }
        });
  }

  // Stop single stream
  stopStream(streamId) {
    const process = this.streamProcesses.get(streamId);
    if (process) {
      try {
        log("info", `Stopping stream: ${streamId}`);
        process.kill();
        this.streamProcesses.delete(streamId);
      } catch (e) {
        log("error", `Error stopping stream ${streamId}: ${e}`);
        dialog.showErrorBox("Stream Stop Error", e.message);
      }
    }
  }

  // Stop all streams
  async stopAllStreams() {
    appState.isStopStream = true;
    const streamIds = Array.from(this.streamProcesses.keys());
    log("info", `Stopping all streams: ${streamIds.length} streams`);

    streamIds.forEach(streamId => this.stopStream(streamId));

    // 等待所有流停止
    await new Promise(resolve => setTimeout(resolve, 500));
    log("info", "All streams stopped");
  }
}

// 窗口相关类，管理主窗口
class WindowManager {
  constructor() {
    this.mainWindow = appState.mainWindow;
    this.contextMenu = null;
  }

  // 创建主窗口
  async createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1920,
      height: 1080,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: true,
        enableRemoteModule: true,
        backgroundThrottling: false,
      },
    });

    appState.mainWindow = this.mainWindow;
    Menu.setApplicationMenu(null);

    const isProduction = app.isPackaged;
    if (isProduction) {
      await this.mainWindow.loadFile("./web_pack/index.html");
    } else {
      await this.mainWindow.loadURL("http://localhost:1024/#/bigScreen");
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
  setupContextMenu() {
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
  getFullscreenLabel() {
    console.log("Current fullscreen status:", this.mainWindow.isFullScreen())
    return this.mainWindow.isFullScreen() ? "Exit Fullscreen" : "Fullscreen";
  }

  // 更新全屏菜单项
  updateFullscreenMenuItem() {
    console.log(this.contextMenu)
    if (this.contextMenu && this.contextMenu.items[0]) {
      this.contextMenu.items[0].label = this.getFullscreenLabel();
    }
  }

  // 处理窗口关闭
  async handleWindowClose() {
    try {
      log("info", "Starting window close process...");
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
      log("error", `Error during window close process: ${error.message}`);
      app.quit();
    }
  }

  // 清空m3u8文件夹
  async clearM3u8Folder() {
    const streamManager = new StreamManager();
    const m3u8Dir = streamManager.getM3u8Dir();

    try {
      await fs.access(m3u8Dir);
      const files = await fs.readdir(m3u8Dir);

      for (const file of files) {
        const filePath = path.join(m3u8Dir, file);
        await fs.unlink(filePath);
      }

      log("info", "m3u8 folder cleared");
    } catch (error) {
      // 目录不存在或其他错误
      log("info", "m3u8 folder does not need to be cleared");
    }
  }
}

// 应用初始化相关类
class AppInitializer {
  constructor() {
    this.streamManager = new StreamManager();
    this.windowManager = new WindowManager();
  }

  // 设置FFmpeg路径
  async setFFmpegPath() {
    let ffmpegPath;

    if (app.isPackaged) {
      ffmpegPath = path.join(
          process.resourcesPath,
          "app",
          "electron",
          "ffmpeg",
          "bin",
          process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      );
    } else {
      ffmpegPath = path.join(
          "electron",
          "ffmpeg",
          "bin",
          process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      );
    }

    try {
      await fs.access(ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
      log("info", `FFmpeg path set successfully: ${ffmpegPath}`);
      return ffmpegPath;
    } catch (err) {
      log("error", `Error setting FFmpeg path: ${err.message}`);
      throw new Error(`FFmpeg not found: ${ffmpegPath}`);
    }
  }

  // 处理单实例逻辑
  async setTheLock() {
    const additionalData = { myKey: "myValue" };
    const gotTheLock = app.requestSingleInstanceLock(additionalData);

    if (!gotTheLock) {
      app.quit();
      throw new Error("Application is already running");
    } else {
      app.on(
          "second-instance",
          (event, commandLine, workingDirectory, additionalData) => {
            log(
                "info",
                `Data received from second instance: ${JSON.stringify(additionalData)}`,
            );

            if (this.windowManager.mainWindow) {
              if (this.windowManager.mainWindow.isMinimized())
                this.windowManager.mainWindow.restore();
              this.windowManager.mainWindow.focus();
            }
          },
      );
    }
  }

  // 初始化服务器
  async initServer() {
    try {
      await initServer();
      log("info", "Server initialization successful");
    } catch (error) {
      log("error", `Server initialization failed: ${error.message}`);
      throw error;
    }
  }

  // 初始化应用
  async init() {
    try {
      await this.setTheLock();
      await this.setFFmpegPath();

      // 确保m3u8目录存在
      const streamManager = new StreamManager();
      await streamManager.ensureDirectoryExists(streamManager.getM3u8Dir());

      // 启动服务器并创建窗口
      app.whenReady().then(async () => {
        try {
          await this.initServer();
          await this.windowManager.createMainWindow();
          this.setupIpcHandlers();
          log("info", "Application initialization successful");
        } catch (error) {
          log("error", `Application initialization error: ${error.message}`);
          app.quit();
        }
      });
    } catch (error) {
      log("error", `Application initialization error: ${error.message}`);
      app.quit();
    }
  }

  // 设置IPC通信处理函数
  setupIpcHandlers() {
    ipcMain.handle("start-stream", async (event, { rtspUrl, streamId }) => {
      return this.streamManager.startStream(rtspUrl, streamId);
    });

    ipcMain.handle("stop-stream", (event, streamId) => {
      this.streamManager.stopStream(streamId);
    });

    ipcMain.handle("stop-all-stream", async () => {
      await this.streamManager.stopAllStreams();
    });

    ipcMain.handle("get-fullscreen-status", () => {
      return this.windowManager.mainWindow?.isFullScreen() || false;
    });
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
    log("error", `Program exit cleanup failed: ${error.message}`);
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
      log("error", `Error closing all windows: ${error.message}`);
      app.quit();
    }
  }
});
