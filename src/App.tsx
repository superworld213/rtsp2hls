import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Sidebar from './components/Sidebar';
import VideoPreview from './pages/VideoPreview';
import VideoConfig from './pages/VideoConfig';
import LocalSettings from './pages/LocalSettings';
import './index.css';

const { Content } = Layout;

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      {/* 正确配置：HashRouter + 相对路径 "./" */}
      <Router basename="/">
        <Layout className="min-h-screen">
          <Sidebar />
          <Layout>
            <Content className="bg-gray-50">
              <Routes>
                <Route path="/" element={<VideoPreview />} /> {/* 正常匹配 */}
                <Route path="/preview" element={<VideoPreview />} />
                <Route path="/config" element={<VideoConfig />} />
                <Route path="/settings" element={<LocalSettings />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Router>
    </ConfigProvider>
  );
}

export default App;