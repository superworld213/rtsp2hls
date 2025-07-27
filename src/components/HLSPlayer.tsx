import React, { useEffect, useRef, useCallback } from 'react';

/**
 * HLS播放器组件的Props接口
 * @interface HLSPlayerProps
 * @property {string} videoUrl - 视频的播放地址
 * @property {string} [className] - 自定义CSS类名
 * @property {React.CSSProperties} [style] - 自定义样式
 */
interface HLSPlayerProps {
  videoUrl?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * HLS播放器组件
 * 基于EasyPlayerPro实现的React HLS视频播放器
 */
const HLSPlayer: React.FC<HLSPlayerProps> = ({ 
  videoUrl = '', 
  className = '',
  style = {} 
}) => {
  // 用于存储EasyPlayerPro实例
  const easyPlayerRef = useRef<any>(null);
  // 播放器容器的引用
  const containerRef = useRef<HTMLDivElement>(null);
  // 生成唯一ID
  const playerIdRef = useRef<string>(`EasyPlayer${Math.random().toString(36).substring(2)}`);

  /**
   * 创建播放器实例
   */
  const createPlayer = useCallback(() => {
    // 从window对象获取EasyPlayerPro构造函数
    const EasyPlayerPro = (window as any).EasyPlayerPro;
    
    if (!EasyPlayerPro || !containerRef.current) {
      console.error('EasyPlayerPro not found or container not ready');
      return;
    }

    // 创建EasyPlayerPro实例并传入配置
    easyPlayerRef.current = new EasyPlayerPro(containerRef.current, {
      isLive: true, // 是否为直播流，默认true
      bufferTime: 0.2, // 缓存时长
      stretch: false, // 是否拉伸视频
      MSE: false, // MSE相关配置
      WCS: false, // WCS相关配置
      hasAudio: false, // 是否有音频
      watermark: { 
        text: { content: 'easyplayer-pro' }, 
        right: 10, 
        top: 10 
      }, // 水印配置
    });

    // 开始播放视频
    playVideo();
  }, []);

  /**
   * 开始播放视频
   */
  const playVideo = useCallback(() => {
    if (!easyPlayerRef.current || !videoUrl) {
      return;
    }

    // 使用setTimeout确保当前调用栈结束后执行播放操作
    setTimeout(() => {
      easyPlayerRef.current
        ?.play(videoUrl)
        .then(() => {
          console.log('Video started playing successfully');
        })
        .catch((error: any) => {
          // 捕获播放异常并打印错误信息
          console.error('Video play error:', error);
        });
    }, 0);
  }, [videoUrl]);

  /**
   * 销毁播放器实例
   */
  const destroyPlayer = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      // 若easyPlayer实例存在，则销毁实例并置为null
      if (easyPlayerRef.current) {
        easyPlayerRef.current.destroy();
        easyPlayerRef.current = null;
      }
      // 延迟100毫秒后标记销毁操作完成
      setTimeout(() => {
        resolve(true);
      }, 100);
    });
  }, []);

  // 组件挂载后，若videoUrl存在则创建并播放视频
  useEffect(() => {
    if (videoUrl) {
      createPlayer();
    }

    // 组件卸载前，销毁播放器实例
    return () => {
      destroyPlayer();
    };
  }, [videoUrl, createPlayer, destroyPlayer]);

  // 当videoUrl变化时，重新播放
  useEffect(() => {
    if (easyPlayerRef.current && videoUrl) {
      playVideo();
    }
  }, [videoUrl, playVideo]);

  const defaultStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: '#0c0c0c',
    ...style
  };

  return (
    <div 
      className={className}
      style={defaultStyle}
    >
      <div 
        ref={containerRef}
        id={playerIdRef.current}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default HLSPlayer;