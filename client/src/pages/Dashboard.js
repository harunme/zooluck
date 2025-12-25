import React, { useState } from 'react';
import { Layout, Button, Dropdown, Space, Card, Tooltip } from 'antd';
import { LogoutOutlined, UserOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import PrizeSettings from '../components/PrizeSettings';
import WinningRecords from '../components/WinningRecords';
import './Dashboard.css';

const { Header, Content } = Layout;

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('prize');

  const navItems = [
    { key: 'prize', label: '奖品设置', icon: <CopyOutlined /> },
    { key: 'record', label: '中奖记录', icon: <FileTextOutlined /> },
  ];

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登陆',
      onClick: onLogout,
    },
  ];

  const handleNavClick = (key) => {
    setActiveTab(key);
  };

  return (
    <Layout className="dashboard">
      <Header className="dashboard-header">
        <div className="header-content">
          <h1>🎁 AI无界 智享未来</h1>
          
          <div className="nav-center">
            {navItems.map((item) => (
              <Tooltip key={item.key} title={item.label}>
                <Button
                  type={activeTab === item.key && item.key !== 'system' ? 'primary' : 'text'}
                  className={`nav-btn ${activeTab === item.key && item.key !== 'system' ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.key)}
                  icon={item.icon}
                >
                  {item.label}
                </Button>
              </Tooltip>
            ))}
          </div>

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space className="user-info">
              <UserOutlined />
              <span>{user.username}</span>
            </Space>
          </Dropdown>
        </div>
      </Header>

      <Content className="dashboard-content">
        <Card className="content-card" bordered={false}>
          {activeTab === 'prize' && <PrizeSettings />}
          {activeTab === 'record' && <WinningRecords />}
        </Card>
      </Content>
    </Layout>
  );
}

export default Dashboard;
