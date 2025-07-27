const { join, dirname } = require("path");
const { fileURLToPath } = require("url");
const { readFile, stat, access } = require("fs/promises");
const { constants } = require("fs");
const os = require("os");
const path = require("path");

// 获取应用数据目录
function getAppDataPath() {
  const homeDir = os.homedir();
  return join(homeDir, "AppData", "Roaming", "smart-granary");
}

// 静态文件根目录 - 使用应用数据目录
const STATIC_ROOT = getAppDataPath();

module.exports = {
  initServer: async () => {
    const http = require("http");

    // 创建服务器实例
    const server = http.createServer(async (req, res) => {
      try {
        // 获取请求的文件路径
        let filePath = req.url === "/" ? "/index.html" : req.url;

        // 构建绝对路径，防止路径遍历攻击
        const absolutePath = join(STATIC_ROOT, filePath);

        // 验证请求的路径是否在静态文件根目录内
        if (!absolutePath.startsWith(STATIC_ROOT)) {
          res.statusCode = 403;
          return res.end("Forbidden");
        }

        // 检查文件是否存在
        await access(absolutePath, constants.F_OK);
        const stats = await stat(absolutePath);

        // 如果是目录，尝试返回 index.html
        if (stats.isDirectory()) {
          const indexPath = join(absolutePath, "index.html");
          await access(indexPath, constants.F_OK);
          return serveFile(indexPath, res);
        }

        // 是文件，直接提供服务
        return serveFile(absolutePath, res);
      } catch (err) {
        console.error("Request error:", err);

        if (err.code === "ENOENT" || err.code === "EACCES") {
          res.statusCode = 404;
          return res.end("File Not Found");
        }

        res.statusCode = 500;
        res.end(`Internal Server Error: ${err.message}`);
      }
    });

    // 辅助函数：提供文件服务
    async function serveFile(filePath, res) {
      try {
        // 获取文件扩展名以确定 MIME 类型
        const extname = path.extname(filePath);

        // 根据文件扩展名设置 MIME 类型
        const mimeTypes = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".jpg": "image/jpg",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".wav": "audio/wav",
          ".mp4": "video/mp4",
          ".woff": "application/font-woff",
          ".ttf": "application/font-ttf",
          ".eot": "application/vnd.ms-fontobject",
          ".otf": "application/font-otf",
          ".wasm": "application/wasm",
        };

        const contentType = mimeTypes[extname] || "application/octet-stream";

        // 读取文件内容
        const content = await readFile(filePath);

        // 设置响应头并返回内容
        res.setHeader("Content-Type", contentType);
        res.statusCode = 200;
        res.end(content, "utf-8");
      } catch (err) {
        console.error("File error:", err);

        if (err.code === "ENOENT" || err.code === "EACCES") {
          res.statusCode = 404;
          return res.end("File Not Found");
        }

        res.statusCode = 500;
        res.end(`Internal Server Error: ${err.message}`);
      }
    }

    // 启动服务器
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Static files root directory: ${STATIC_ROOT}`);
    });
  },
};
