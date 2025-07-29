# RTSP2HLS 桌面应用

一个基于 Electron + React + FFmpeg 的 RTSP 视频流转 HLS 格式的桌面应用程序。

## 功能特性

- 🎥 **视频预览**: 实时预览转换后的 HLS 视频流
- ⚙️ **视频配置**: 添加、编辑和管理 RTSP 视频源
- 🔧 **本地设置**: 配置应用参数和查看系统信息
- 🚀 **自动转换**: 使用 FFmpeg 自动将 RTSP 流转换为 HLS 格式
- 💾 **进程管理**: 智能管理 FFmpeg 进程，关闭时自动清理

## 技术栈

- **前端**: React 18 + TypeScript + Ant Design
- **桌面框架**: Electron
- **构建工具**: Vite
- **状态管理**: Zustand
- **样式**: Tailwind CSS + Ant Design
- **视频处理**: FFmpeg

## 系统要求

- Node.js 18+
- Windows 10+ / macOS 10.14+ / Linux

## 安装和运行

### 开发环境

1. 克隆项目
```bash
git clone <repository-url>
cd rtsp2hls
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm run dev
```

4. 在另一个终端启动 Electron
```bash
npm run electron-dev
```

### 生产构建

```bash
# 构建前端
npm run build

# 打包 Electron 应用
npm run dist
```

## 使用说明

### 1. 视频配置

1. 点击左侧导航栏的「视频配置」
2. 点击「添加视频流」按钮
3. 填写以下信息：
   - **流名称**: 给视频流起一个易识别的名称
   - **RTSP地址**: 完整的 RTSP URL (如: `rtsp://username:password@192.168.1.100:554/stream`)
   - **分辨率**: 选择输出分辨率
   - **码率**: 选择视频码率
   - **帧率**: 选择视频帧率
   - **启用音频**: 是否包含音频流
4. 点击「确定」保存配置
5. 点击「启动」按钮开始转换

### 2. 视频预览

1. 确保至少有一个视频流正在运行
2. 点击左侧导航栏的「视频预览」
3. 从列表中选择要预览的视频流
4. 点击播放按钮开始播放

### 3. 本地设置

1. 点击左侧导航栏的「本地设置」
2. 配置以下参数：
   - **日志级别**: 应用日志详细程度
   - **最大并发流**: 同时运行的最大视频流数量
   - **HLS 片段时长**: 每个 HLS 片段的时长
   - **HLS 播放列表大小**: 播放列表中保留的片段数量

## FFmpeg

FFmpeg 已被集成到本应用中，您无需手动下载或配置。应用会自动管理 FFmpeg 进程。
3. 将 `C:\ffmpeg\bin` 添加到系统 PATH 环境变量
4. 重启命令行，运行 `ffmpeg -version` 验证安装

### macOS
```bash
# 使用 Homebrew
brew install ffmpeg
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install ffmpeg
```

## 项目结构

```
rtsp2hls/
├── electron/                 # Electron 主进程文件
│   ├── main.js              # 主进程入口
│   └── preload.js           # 预加载脚本
├── src/
│   ├── components/          # React 组件
│   ├── pages/               # 页面组件
│   ├── store/               # Zustand 状态管理
│   ├── types/               # TypeScript 类型定义
│   └── App.tsx              # 应用入口组件
├── public/                  # 静态资源
└── dist/                    # 构建输出目录
```

## 常见问题

### Q: FFmpeg 进程没有正确关闭怎么办？
A: 应用会在关闭时自动清理所有 FFmpeg 进程。如果遇到问题，可以手动在任务管理器中结束 FFmpeg 进程。

### Q: RTSP 流连接失败怎么办？
A: 请检查：
- RTSP URL 是否正确
- 网络连接是否正常
- 用户名密码是否正确
- 摄像头或流媒体服务器是否正常工作

### Q: 视频播放卡顿怎么办？
A: 可以尝试：
- 降低输出分辨率
- 降低码率设置
- 增加 HLS 片段时长
- 检查系统性能

## 开发说明

### 添加新功能

1. 在 `src/types/` 中定义相关类型
2. 在 `src/store/` 中添加状态管理逻辑
3. 在 `src/components/` 或 `src/pages/` 中实现 UI 组件
4. 如需 Electron 功能，在 `electron/main.js` 中添加 IPC 处理器

### 调试

- 前端调试：在浏览器开发者工具中调试
- Electron 调试：在 `electron/main.js` 中启用 `webContents.openDevTools()`
- FFmpeg 调试：查看控制台输出的 FFmpeg 日志

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
