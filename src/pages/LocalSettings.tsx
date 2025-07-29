import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Switch, Button, Descriptions, Row, Col, message, InputNumber } from 'antd';
import { FolderOpenOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { useStreamStore } from '../store/useStreamStore';
import { AppSettings } from '../types/stream';
import { SystemInfo } from '../types/electron';

const { Option } = Select;

const LocalSettings: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useStreamStore();
  const [form] = Form.useForm<AppSettings>();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 加载系统信息
    loadSystemInfo();
    
    // 初始化表单值
    form.setFieldsValue(settings);
  }, [settings, form]);

  const loadSystemInfo = async () => {
    if (window.electronAPI) {
      try {
        const info = await window.electronAPI.getSystemInfo();
        setSystemInfo(info);
      } catch (error) {
        console.error('获取系统信息失败:', error);
      }
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      updateSettings(values);
      message.success('设置已保存');
    } catch (error) {
      console.error('保存设置失败:', error);
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    resetSettings();
    form.resetFields();
    message.success('设置已重置为默认值');
  };



  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMemoryUsagePercentage = (): number => {
    if (!systemInfo) return 0;
    return ((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">本地设置</h2>
        <p className="text-gray-600">配置应用程序的本地设置和查看系统信息</p>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={14}>
          <Card title="应用配置" className="mb-4">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
            >

              <Form.Item
                name="logLevel"
                label="日志级别"
                rules={[{ required: true, message: '请选择日志级别' }]}
              >
                <Select placeholder="请选择日志级别">
                  <Option value="debug">Debug (调试)</Option>
                  <Option value="info">Info (信息)</Option>
                  <Option value="warn">Warn (警告)</Option>
                  <Option value="error">Error (错误)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="autoStart"
                label="自动启动"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Form.Item
                name="maxConcurrentStreams"
                label="最大并发流数量"
                rules={[
                  { required: true, message: '请输入最大并发流数量' },
                  { type: 'number', min: 1, max: 20, message: '并发流数量必须在1-20之间' }
                ]}
              >
                <InputNumber
                  min={1}
                  max={20}
                  style={{ width: '100%' }}
                  placeholder="最大同时运行的视频流数量"
                />
              </Form.Item>

              <Form.Item
                name="hlsSegmentDuration"
                label="HLS片段时长 (秒)"
                rules={[
                  { required: true, message: '请输入HLS片段时长' },
                  { type: 'number', min: 1, max: 60, message: '片段时长必须在1-60秒之间' }
                ]}
              >
                <InputNumber
                  min={1}
                  max={60}
                  style={{ width: '100%' }}
                  placeholder="每个HLS片段的时长"
                />
              </Form.Item>

              <Form.Item
                name="hlsPlaylistSize"
                label="HLS播放列表大小"
                rules={[
                  { required: true, message: '请输入HLS播放列表大小' },
                  { type: 'number', min: 3, max: 20, message: '播放列表大小必须在3-20之间' }
                ]}
              >
                <InputNumber
                  min={3}
                  max={20}
                  style={{ width: '100%' }}
                  placeholder="播放列表中保留的片段数量"
                />
              </Form.Item>

              <Form.Item>
                <div className="flex space-x-4">
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={loading}
                    onClick={handleSave}
                  >
                    保存设置
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                  >
                    重置为默认值
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={10}>
          <Card title="系统信息" className="mb-4">
            {systemInfo ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="操作系统">
                  {systemInfo.platform} ({systemInfo.arch})
                </Descriptions.Item>
                <Descriptions.Item label="CPU核心数">
                  {systemInfo.cpus} 核
                </Descriptions.Item>
                <Descriptions.Item label="总内存">
                  {formatBytes(systemInfo.totalMemory)}
                </Descriptions.Item>
                <Descriptions.Item label="可用内存">
                  {formatBytes(systemInfo.freeMemory)}
                </Descriptions.Item>
                <Descriptions.Item label="内存使用率">
                  <div className="flex items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${getMemoryUsagePercentage()}%` }}
                      />
                    </div>
                    <span className="text-sm">
                      {getMemoryUsagePercentage().toFixed(1)}%
                    </span>
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="Node.js版本">
                  {systemInfo.nodeVersion}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <div className="text-center text-gray-500">
                加载系统信息中...
              </div>
            )}
          </Card>

          <Card title="应用信息">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="应用名称">
                RTSP2HLS
              </Descriptions.Item>
              <Descriptions.Item label="版本">
                1.0.0
              </Descriptions.Item>
              <Descriptions.Item label="技术栈">
                React + Electron + FFmpeg
              </Descriptions.Item>
              <Descriptions.Item label="支持格式">
                RTSP → HLS
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default LocalSettings;