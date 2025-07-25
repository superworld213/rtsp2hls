import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, Space, Popconfirm, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useStreamStore } from '../store/useStreamStore';
import FFmpegStatus from '../components/FFmpegStatus';
import { StreamConfig } from '../types/stream';
import { RESOLUTION_OPTIONS, BITRATE_OPTIONS, FRAME_RATE_OPTIONS } from '../types/stream';

const { Option } = Select;

interface StreamFormData {
  name: string;
  rtspUrl: string;
  username?: string;
  password?: string;
  resolution: string;
  bitrate: string;
  frameRate: number;
  audioEnabled: boolean;
}

const VideoConfig: React.FC = () => {
  const {
    streams,
    streamStatuses,
    settings,
    addStream,
    updateStream,
    deleteStream,
    updateStreamStatus,
    getStreamStatus
  } = useStreamStore();
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingStream, setEditingStream] = useState<StreamConfig | null>(null);
  const [form] = Form.useForm<StreamFormData>();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [ffmpegAvailable, setFFmpegAvailable] = useState<boolean>(true);

  // 定期更新流状态
  useEffect(() => {
    const interval = setInterval(async () => {
      if (window.electronAPI) {
        try {
          const allStatuses = await window.electronAPI.getAllFFmpegStatus();
          Object.entries(allStatuses).forEach(([id, status]) => {
            updateStreamStatus(id, {
              status: status.running ? 'running' : 'stopped'
            });
          });
        } catch (error) {
          console.error('获取流状态失败:', error);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [updateStreamStatus]);

  const handleAddStream = () => {
    setEditingStream(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEditStream = (stream: StreamConfig) => {
    setEditingStream(stream);
    form.setFieldsValue({
      name: stream.name,
      rtspUrl: stream.rtspUrl,
      username: stream.username,
      password: stream.password,
      resolution: stream.resolution,
      bitrate: stream.bitrate,
      frameRate: stream.frameRate,
      audioEnabled: stream.audioEnabled
    });
    setIsModalVisible(true);
  };

  const handleDeleteStream = async (stream: StreamConfig) => {
    // 如果流正在运行，先停止它
    const status = getStreamStatus(stream.id);
    if (status?.status === 'running') {
      await handleStopStream(stream.id);
    }
    deleteStream(stream.id);
    message.success('删除成功');
  };

  const handleStartStream = async (stream: StreamConfig) => {
    if (!window.electronAPI) {
      message.error('Electron API 不可用');
      return;
    }

    setLoading(prev => ({ ...prev, [stream.id]: true }));
    updateStreamStatus(stream.id, { status: 'starting' });

    try {
      // 确保输出目录存在
      await window.electronAPI.createDirectory(settings.outputDirectory);

      const config = {
        id: stream.id,
        rtspUrl: stream.rtspUrl,
        outputDir: settings.outputDirectory,
        options: {
          resolution: stream.resolution === 'original' ? undefined : stream.resolution,
          bitrate: stream.bitrate,
          hlsTime: settings.hlsSegmentDuration.toString(),
          hlsListSize: settings.hlsPlaylistSize.toString()
        }
      };

      const result = await window.electronAPI.startFFmpegStream(config);
      
      if (result.success) {
        updateStreamStatus(stream.id, {
          status: 'running',
          outputPath: result.outputPath,
          startTime: new Date()
        });
        message.success(`视频流 "${stream.name}" 启动成功`);
      } else {
        // 等待一下让FFmpeg进程有时间生成错误信息
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 获取详细的FFmpeg错误信息
        const ffmpegError = await window.electronAPI.getFFmpegError(stream.id);
        
        let errorMessage = result.error || '启动失败';
        if (ffmpegError) {
          errorMessage = ffmpegError.message;
          // 清除错误信息
          await window.electronAPI.clearFFmpegError(stream.id);
        }
        
        updateStreamStatus(stream.id, {
          status: 'error',
          error: errorMessage
        });
        
        message.error({
          content: errorMessage,
          duration: 10,
        });
      }
    } catch (error) {
      updateStreamStatus(stream.id, {
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      });
      message.error('启动失败');
    } finally {
      setLoading(prev => ({ ...prev, [stream.id]: false }));
    }
  };

  const handleStopStream = async (streamId: string) => {
    if (!window.electronAPI) {
      message.error('Electron API 不可用');
      return;
    }

    setLoading(prev => ({ ...prev, [streamId]: true }));

    try {
      const result = await window.electronAPI.stopFFmpegStream(streamId);
      
      if (result.success) {
        updateStreamStatus(streamId, { status: 'stopped' });
        message.success('视频流已停止');
      } else {
        message.error('停止失败');
      }
    } catch (error) {
      message.error('停止失败');
    } finally {
      setLoading(prev => ({ ...prev, [streamId]: false }));
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingStream) {
        updateStream(editingStream.id, values);
        message.success('更新成功');
      } else {
        addStream({ ...values, status: 'stopped' as const });
        message.success('添加成功');
      }
      
      setIsModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const getStatusTag = (status: string) => {
    const statusConfig = {
      stopped: { color: 'default', text: '已停止' },
      starting: { color: 'processing', text: '启动中' },
      running: { color: 'success', text: '运行中' },
      error: { color: 'error', text: '错误' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    {
      title: 'RTSP地址',
      dataIndex: 'rtspUrl',
      key: 'rtspUrl',
      ellipsis: true,
      width: 200
    },
    {
      title: '分辨率',
      dataIndex: 'resolution',
      key: 'resolution',
      width: 120
    },
    {
      title: '码率',
      dataIndex: 'bitrate',
      key: 'bitrate',
      width: 100
    },
    {
      title: '帧率',
      dataIndex: 'frameRate',
      key: 'frameRate',
      width: 80,
      render: (frameRate: number) => `${frameRate} FPS`
    },
    {
      title: '音频',
      dataIndex: 'audioEnabled',
      key: 'audioEnabled',
      width: 80,
      render: (enabled: boolean) => enabled ? '启用' : '禁用'
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: StreamConfig) => {
        const status = streamStatuses[record.id];
        return getStatusTag(status?.status || 'stopped');
      }
    },
    {
      title: '视频地址',
      key: 'videoUrl',
      width: 250,
      ellipsis: true,
      render: (_: any, record: StreamConfig) => {
        const status = streamStatuses[record.id];
        const isRunning = status?.status === 'running';
        
        if (isRunning) {
          const videoUrl = `http://localhost:8080/hls/${record.id}.m3u8`;
          return (
            <a 
              href={videoUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
            >
              {videoUrl}
            </a>
          );
        }
        return <span className="text-gray-400">-</span>;
      }
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: StreamConfig) => {
        const status = streamStatuses[record.id];
        const isRunning = status?.status === 'running';
        const isLoading = loading[record.id];
        
        return (
          <Space>
            {isRunning ? (
              <Button
                type="primary"
                danger
                size="small"
                icon={<StopOutlined />}
                loading={isLoading}
                onClick={() => handleStopStream(record.id)}
              >
                停止
              </Button>
            ) : (
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                loading={isLoading}
                onClick={() => handleStartStream(record)}
                disabled={!ffmpegAvailable}
              >
                启动
              </Button>
            )}
            
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditStream(record)}
              disabled={isRunning}
            >
              编辑
            </Button>
            
            <Popconfirm
              title="确定要删除这个视频流吗？"
              onConfirm={() => handleDeleteStream(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={isRunning}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  return (
    <div className="p-6">
      <FFmpegStatus onStatusChange={setFFmpegAvailable} />
      
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">视频配置</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddStream}
          disabled={!ffmpegAvailable}
        >
          添加视频流
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={streams}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      <Modal
        title={editingStream ? '编辑视频流' : '添加视频流'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={600}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            resolution: '1280x720',
            bitrate: '2000k',
            frameRate: 25,
            audioEnabled: true
          }}
        >
          <Form.Item
            name="name"
            label="流名称"
            rules={[{ required: true, message: '请输入流名称' }]}
          >
            <Input placeholder="请输入流名称" />
          </Form.Item>

          <Form.Item
            name="rtspUrl"
            label="RTSP地址"
            rules={[
              { required: true, message: '请输入RTSP地址' },
              { pattern: /^rtsp:\/\//, message: 'RTSP地址必须以rtsp://开头' }
            ]}
          >
            <Input placeholder="rtsp://username:password@host:port/path" />
          </Form.Item>

          <Form.Item name="username" label="用户名">
            <Input placeholder="可选" />
          </Form.Item>

          <Form.Item name="password" label="密码">
            <Input.Password placeholder="可选" />
          </Form.Item>

          <Form.Item
            name="resolution"
            label="分辨率"
            rules={[{ required: true, message: '请选择分辨率' }]}
          >
            <Select placeholder="请选择分辨率">
              {RESOLUTION_OPTIONS.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="bitrate"
            label="码率"
            rules={[{ required: true, message: '请选择码率' }]}
          >
            <Select placeholder="请选择码率">
              {BITRATE_OPTIONS.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="frameRate"
            label="帧率"
            rules={[{ required: true, message: '请选择帧率' }]}
          >
            <Select placeholder="请选择帧率">
              {FRAME_RATE_OPTIONS.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="audioEnabled"
            label="启用音频"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default VideoConfig;