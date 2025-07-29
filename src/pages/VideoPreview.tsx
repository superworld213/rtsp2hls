import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Row, Col, Statistic, Alert, Spin } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useStreamStore } from '../store/useStreamStore';
import Hls from 'hls.js';
import { Stream } from '../types/stream';

interface VideoPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  stats: {
    duration: string;
    currentTime: string;
    resolution: string;
  };
}

const VideoCard: React.FC<{ stream: Stream }> = ({ stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playerState, setPlayerState] = useState<VideoPlayerState>({
    isPlaying: false,
    isLoading: false,
    stats: {
      duration: '00:00:00',
      currentTime: '00:00:00',
      resolution: '-',
    },
  });

  const { getStreamStatus } = useStreamStore();
  const streamStatus = getStreamStatus(stream.id);

  const handlePlay = async () => {
    setPlayerState(prev => ({ ...prev, isLoading: true }));
    try {
      if (videoRef.current && window.electronAPI) {
        const streamUrlInfo = await window.electronAPI.getStreamUrl(stream.id);
        if (streamUrlInfo?.url) {
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          const hls = new Hls({
            enableWorker: false,
            lowLatencyMode: true,
            backBufferLength: 90,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrlInfo.url);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current?.play();
            setPlayerState(prev => ({ ...prev, isPlaying: true }));
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS error:', data);
          });
        } else {
          console.error('无法获取流URL');
        }
      }
    } catch (error) {
      console.error('播放失败:', error);
    } finally {
      setPlayerState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handlePause = () => {
    videoRef.current?.pause();
    setPlayerState(prev => ({ ...prev, isPlaying: false }));
  };

  const handleFullscreen = () => {
    videoRef.current?.requestFullscreen();
  };

  const updateVideoStats = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const duration = isNaN(video.duration) ? 0 : video.duration;
      const currentTime = video.currentTime;
      setPlayerState(prev => ({
        ...prev,
        stats: {
          duration: formatTime(duration),
          currentTime: formatTime(currentTime),
          resolution: video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : '-',
        },
      }));
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
    };
  }, []);

  return (
    <Spin spinning={playerState.isLoading} tip="加载视频中...">
      <Card title={stream.name} bordered={false} className="shadow-lg mb-6">
        <Row gutter={16}>
          <Col span={18}>
            <div className="relative w-full bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full"
                onTimeUpdate={updateVideoStats}
                onLoadedMetadata={updateVideoStats}
              />
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-50 text-white flex items-center justify-between">
                <Button
                  icon={playerState.isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={playerState.isPlaying ? handlePause : handlePlay}
                  ghost
                />
                <span>{playerState.stats.currentTime} / {playerState.stats.duration}</span>
                <Button icon={<FullscreenOutlined />} onClick={handleFullscreen} ghost />
              </div>
            </div>
          </Col>
          <Col span={6}>
            <h3 className="text-lg font-semibold mb-2">视频信息</h3>
            <Statistic title="状态" value={streamStatus?.status || '未知'} />
            <Statistic title="分辨率" value={playerState.stats.resolution} />
            <Statistic title="码率" value={stream.bitrate} />
            <Statistic title="帧率" value={`${stream.frameRate} FPS`} />
            <Statistic title="音频" value={stream.audioEnabled ? '开启' : '关闭'} />
          </Col>
        </Row>
      </Card>
    </Spin>
  );
};

const VideoPreview: React.FC = () => {
  const { streams, streamStatuses } = useStreamStore();

  const runningStreams = streams.filter(stream => {
    const status = streamStatuses[stream.id];
    return status && status.status === 'running';
  });

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">视频预览</h2>
      {runningStreams.length === 0 ? (
        <Alert
          message="暂无运行中的视频流"
          description="请先在视频配置页面添加并启动视频流"
          type="info"
          showIcon
        />
      ) : (
        <div>
          {runningStreams.map(stream => (
            <VideoCard key={stream.id} stream={stream} />
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoPreview;