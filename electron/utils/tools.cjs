// 日志工具函数，添加时间戳并区分日志级别
const log = (level, message = '') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
};

module.exports = {
  log
}