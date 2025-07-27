<script setup lang="ts">
// 引入 Vue 的 onMounted、onUnmounted 和 ref 函数
import { onMounted, onUnmounted, ref } from "vue";

/**
 * 用于存储 EasyPlayerPro 实例
 */
let easyPlayer: any;

/**
 * 定义组件的 props 接口
 * @interface Props
 * @property {string} videoUrl - 视频的播放地址
 */
interface Props {
  videoUrl?: string;
}

// 生成一个随机字符串作为唯一 ID，用于标识播放器容器
const randomId = ref<string>(Math.random().toString(36).substring(2));

// 定义组件的 props，若未传入 videoUrl，则使用默认值
const { videoUrl = "" } = defineProps<Props>();

/**
 * 创建播放器实例
 * @function playCreate
 */
const playCreate = () => {
  // 从 window 对象获取 EasyPlayerPro 构造函数
  let EasyPlayerPro = (window as any).EasyPlayerPro;
  // 根据随机 ID 获取播放器容器元素
  let container = document.getElementById(`EasyPlayer${randomId.value}`);
  // 创建 EasyPlayerPro 实例并传入配置
  easyPlayer = new EasyPlayerPro(container, {
    isLive: true, // 是否为直播流，默认 true
    bufferTime: 0.2, // 缓存时长
    stretch: false, // 是否拉伸视频
    MSE: false, // MSE 相关配置
    WCS: false, // WCS 相关配置
    hasAudio: false, // 是否有音频
    watermark: { text: { content: "easyplayer-pro" }, right: 10, top: 10 }, // 水印配置
  }) as object;

  // 调用播放函数开始播放视频
  onPlayer();
};

/**
 * 开始播放视频
 * @function onPlayer
 */
const onPlayer = () => {
  // 使用 setTimeout 确保当前调用栈结束后执行播放操作
  setTimeout(
    () => {
      // 若 easyPlayer 实例存在，则调用 play 方法播放视频
      easyPlayer &&
        easyPlayer
          .play(videoUrl)
          .then(() => {})
          .catch((e: any) => {
            // 捕获播放异常并打印错误信息
            console.error(e);
          });
    },
    0,
    videoUrl,
  );
};

/**
 * 销毁播放器实例
 * @function onDestroy
 * @returns {Promise<boolean>} - 销毁操作完成的 Promise
 */
const onDestroy = () => {
  return new Promise((resolve) => {
    // 若 easyPlayer 实例存在，则销毁实例并置为 null
    if (easyPlayer) {
      easyPlayer.destroy();
      easyPlayer = null;
    }
    // 延迟 100 毫秒后标记销毁操作完成
    setTimeout(() => {
      resolve(true);
    }, 100);
  });
};

// 组件挂载后，若 videoUrl 存在则创建并播放视频
onMounted(() => {
  videoUrl && playCreate();
});

// 组件卸载前，销毁播放器实例
onUnmounted(() => {
  onDestroy();
});

defineExpose({ onDestroy });
</script>

<template>
  <div style="width: 100%; height: 100%; background: #0c0c0c">
    <div :id="'EasyPlayer' + randomId"></div>
  </div>
  <!-- 创建一个 div 作为播放器的容器，其 ID 由 EasyPlayer 和随机 ID 拼接而成 -->
</template>

<style scoped lang="less"></style>
