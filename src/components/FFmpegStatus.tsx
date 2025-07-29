import React, { useState, useEffect } from 'react';
import { Alert, Button, Card, Typography, Steps, Spin } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { FFmpegCheckResult } from '../types/electron';

const { Title, Paragraph, Text, Link } = Typography;
const { Step } = Steps;

interface FFmpegStatusProps {
  onStatusChange?: (available: boolean) => void;
}

const FFmpegStatus: React.FC<FFmpegStatusProps> = ({ onStatusChange }) => {
  const [ffmpegStatus, setFFmpegStatus] = useState<FFmpegCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  const checkFFmpegStatus = async () => {
    console.log("info", "开始检查FFmpeg",window.electronAPI);

    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.checkFFmpeg();
      console.log("info", "FFmpeg检查结果", result);
      setFFmpegStatus(result);
      onStatusChange?.(result.available);
    } catch (error) {
      console.error('检查FFmpeg状态失败:', error);
      setFFmpegStatus({ available: false, error: '检查FFmpeg状态失败' });
      onStatusChange?.(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkFFmpegStatus();
  }, []);

  const installSteps = [
    {
      title: '下载FFmpeg',
      description: (
        <div>
          <Paragraph>
            访问 <Link href="https://ffmpeg.org/download.html" target="_blank">FFmpeg官网</Link> 下载适合您操作系统的版本
          </Paragraph>
          <Paragraph>
            Windows用户推荐下载 "Windows builds by BtbN" 或 "Windows builds from gyan.dev"
          </Paragraph>
        </div>
      ),
    },
    {
      title: '解压文件',
      description: (
        <Paragraph>
          将下载的压缩包解压到一个固定目录，例如 <Text code>C:\ffmpeg</Text>
        </Paragraph>
      ),
    },
    {
      title: '添加到系统PATH',
      description: (
        <div>
          <Paragraph>Windows系统:</Paragraph>
          <ol>
            <li>右键点击"此电脑" → "属性" → "高级系统设置"</li>
            <li>点击"环境变量"</li>
            <li>在"系统变量"中找到"Path"，点击"编辑"</li>
            <li>点击"新建"，添加FFmpeg的bin目录路径（如 <Text code>C:\ffmpeg\bin</Text>）</li>
            <li>点击"确定"保存设置</li>
          </ol>
        </div>
      ),
    },
    {
      title: '验证安装',
      description: (
        <div>
          <Paragraph>
            打开命令提示符（cmd），输入 <Text code>ffmpeg -version</Text> 验证安装
          </Paragraph>
          <Paragraph>
            如果显示版本信息，说明安装成功
          </Paragraph>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>正在检查FFmpeg状态...</Paragraph>
        </div>
      </Card>
    );
  }

  if (ffmpegStatus?.available) {
    const isUsingLocal = (ffmpegStatus as any).usingLocal;
    const ffmpegPath = (ffmpegStatus as any).path;
    
    return (
      <Alert
        message="FFmpeg已就绪"
        description={
          <div>
            <div>FFmpeg已正确安装并可用，您可以开始使用RTSP转HLS功能。</div>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              {isUsingLocal ? (
                <span>✓ 使用项目内置FFmpeg: {ffmpegPath}</span>
              ) : (
                <span>✓ 使用系统FFmpeg: {ffmpegPath}</span>
              )}
            </div>
          </div>
        }
        type="success"
        icon={<CheckCircleOutlined />}
        action={
          <Button size="small" onClick={checkFFmpegStatus} icon={<ReloadOutlined />}>
            重新检查
          </Button>
        }
        style={{ marginBottom: 16 }}
      />
    );
  }

  return (
    <Card>
      <Alert
        message="FFmpeg未安装"
        description={ffmpegStatus?.error || 'FFmpeg未安装或不在系统PATH中'}
        type="error"
        icon={<ExclamationCircleOutlined />}
        action={
          <Button size="small" onClick={checkFFmpegStatus} icon={<ReloadOutlined />}>
            重新检查
          </Button>
        }
        style={{ marginBottom: 24 }}
      />
      
      <Title level={4}>FFmpeg配置</Title>
      <Paragraph>
        RTSP2HLS应用需要FFmpeg来处理视频流转换。本项目已经包含了FFmpeg执行文件，通常无需手动安装。
        如果仍然出现问题，您可以按照以下步骤手动安装FFmpeg:
      </Paragraph>
      
      <Steps direction="vertical" current={-1}>
        {installSteps.map((step, index) => (
          <Step
            key={index}
            title={step.title}
            description={step.description}
          />
        ))}
      </Steps>
      
      <Alert
        message="重要提示"
        description="安装完成后，请重启本应用程序以确保环境变量生效。"
        type="warning"
        style={{ marginTop: 24 }}
      />
    </Card>
  );
};

export default FFmpegStatus;