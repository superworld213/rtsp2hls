import React, { useState, useEffect, useRef } from 'react';
import { Card, Select, Button, Row, Col, Statistic, Alert, Spin } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useStreamStore } from '../store/useStreamStore';
import Hls from 'hls.js';

const { Option } = Select;

const VideoPreview: React.FC = () => {
  const { streams, streamStatuses, getStreamStatus } = useStreamStore();
  const [selectedStreamId, setSelectedStreamId] = useState<string | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [videoStats, setVideoStats] = useState({
    duration: '00:00:00',
    currentTime: '00:00:00',
    resolution: '-',
    bitrate: '-'
  });

  const selectedStream = streams.find(s => s.id === selectedStreamId);
  const streamStatus = selectedStreamId ? getStreamStatus(selectedStreamId) : undefined;

  useEffect(() => {
    // 默认选择第一个运行中的流
    const runningStreams = streams.filter(stream => {
      const status = streamStatuses[stream.id];
      return status && status.status === 'running';
    });
    
    if (runningStreams.length > 0 && !selectedStreamId) {
      setSelectedStreamId(runningStreams[0].id);
    }
  }, [streams, streamStatuses, selectedStreamId]);

  const handleStreamSelect = (streamId: string) => {
    setSelectedStreamId(streamId);
    setIsPlaying(false);
  };

  const handlePlay = async () => {
    if (!selectedStreamId) return;
    
    setIsLoading(true);
    try {
      if (videoRef.current && window.electronAPI) {
        // 获取HTTP服务器提供的流URL
        const streamUrlInfo = await window.electronAPI.getStreamUrl(selectedStreamId);
        if (streamUrlInfo?.url) {
          console.log('播放URL:', streamUrlInfo.url);
          
          // 清理之前的HLS实例
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          
          // 检查浏览器是否原生支持HLS
          if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari原生支持HLS
            videoRef.current.src = streamUrlInfo.url;
          } else if (Hls.isSupported()) {
            // 使用HLS.js
            const hls = new Hls({
              enableWorker: false,
              lowLatencyMode: true,
              backBufferLength: 90
            });
            hlsRef.current = hls;
            
            hls.loadSource(streamUrlInfo.url);
            hls.attachMedia(videoRef.current);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log('HLS manifest parsed, ready to play');
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error('HLS error:', data);
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('Network error, trying to recover...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('Media error, trying to recover...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log('Fatal error, cannot recover');
                    hls.destroy();
                    break;
                }
              }
            });
          } else {
            console.error('HLS is not supported in this browser');
            return;
          }
          
          await videoRef.current.play();
          setIsPlaying(true);
        } else {
          console.error('无法获取流URL');
        }
      }
    } catch (error) {
      console.error('播放失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };
  
  // 清理HLS实例
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const updateVideoStats = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const duration = isNaN(video.duration) ? 0 : video.duration;
      const currentTime = video.currentTime;
      
      setVideoStats({
        duration: formatTime(duration),
        currentTime: formatTime(currentTime),
        resolution: video.videoWidth && video.videoHeight 
          ? `${video.videoWidth}x${video.videoHeight}` 
          : '-',
        bitrate: '-' // HLS doesn't provide bitrate info directly
      });
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const runningStreams = streams.filter(stream => {
    const status = streamStatuses[stream.id];
    return status && status.status === 'running';
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">视频预览</h2>
        
        {runningStreams.length === 0 ? (
          <Alert
            message="暂无运行中的视频流"
            description="请先在视频配置页面添加并启动视频流"
            type="info"
            showIcon
          />
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">选择视频流:</label>
            <Select
              style={{ width: 300 }}
              placeholder="请选择要预览的视频流"
              value={selectedStreamId}
              onChange={handleStreamSelect}
            >
              {runningStreams.map(stream => (
                <Option key={stream.id} value={stream.id}>
                  {stream.name} ({stream.resolution})
                </Option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {selectedStream && (
        <Row gutter={[16, 16]}>
          <Col span={16}>
            <Card title={`${selectedStream.name} - 视频播放器`}>
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  onTimeUpdate={updateVideoStats}
                  onLoadedMetadata={updateVideoStats}
                  controls={false}
                  playsInline
                />
                
                {/* 播放控制覆盖层 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center space-x-4">
                      <Spin spinning={isLoading}>
                        {isPlaying ? (
                          <Button
                            type="text"
                            icon={<PauseCircleOutlined />}
                            onClick={handlePause}
                            className="text-white hover:text-blue-400"
                            size="large"
                          />
                        ) : (
                          <Button
                            type="text"
                            icon={<PlayCircleOutlined />}
                            onClick={handlePlay}
                            className="text-white hover:text-blue-400"
                            size="large"
                            disabled={!streamStatus?.outputPath}
                          />
                        )}
                      </Spin>
                      <span className="text-sm">
                        {videoStats.currentTime} / {videoStats.duration}
                      </span>
                    </div>
                    
                    <Button
                      type="text"
                      icon={<FullscreenOutlined />}
                      onClick={handleFullscreen}
                      className="text-white hover:text-blue-400"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          
          <Col span={8}>
            <Card title="流状态信息" className="mb-4">
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title="状态"
                    value={streamStatus?.status || 'unknown'}
                    valueStyle={{
                      color: streamStatus?.status === 'running' ? '#3f8600' : '#cf1322'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="分辨率"
                    value={videoStats.resolution}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="码率"
                    value={selectedStream.bitrate}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="帧率"
                    value={`${selectedStream.frameRate} FPS`}
                  />
                </Col>
              </Row>
            </Card>
            
            <Card title="流配置信息">
              <div className="space-y-2 text-sm">
                <div><strong>名称:</strong> {selectedStream.name}</div>
                <div><strong>RTSP地址:</strong> {selectedStream.rtspUrl}</div>
                <div><strong>分辨率:</strong> {selectedStream.resolution}</div>
                <div><strong>码率:</strong> {selectedStream.bitrate}</div>
                <div><strong>音频:</strong> {selectedStream.audioEnabled ? '启用' : '禁用'}</div>
                <div><strong>创建时间:</strong> {selectedStream.createdAt.toLocaleString()}</div>
              </div>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default VideoPreview;