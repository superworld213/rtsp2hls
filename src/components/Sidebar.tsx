import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlayCircleOutlined, SettingOutlined, DesktopOutlined } from '@ant-design/icons';

const { Sider } = Layout;

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/preview',
      icon: <PlayCircleOutlined />,
      label: '视频预览'
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: '视频配置'
    },
    {
      key: '/settings',
      icon: <DesktopOutlined />,
      label: '本地设置'
    }
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Sider
      width={200}
      className="bg-white shadow-md"
      theme="light"
    >
      <div className="h-16 flex items-center justify-center border-b border-gray-200">
        <h1 className="text-lg font-bold text-blue-600">RTSP2HLS</h1>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        className="border-r-0 h-full"
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
};

export default Sidebar;