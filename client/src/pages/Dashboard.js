import React, { useState, useEffect } from "react";
import { Layout, Button, Dropdown, Space, Card, Tooltip } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import PrizeSettings from "../components/PrizeSettings";
import WinningRecords from "../components/WinningRecords";
import SystemSettings from "../components/SystemSettings";
import logo from "./logo.png";
import "./Dashboard.css";

const { Header, Content } = Layout;

function Dashboard({ user, defaultTab, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(defaultTab || "record");

  useEffect(() => {
    if (location.pathname) {
      const pathTab = location.pathname.replace("/", "");
      if (["record", "prize", "system"].includes(pathTab)) {
        setActiveTab(pathTab);
      }
    }
  }, [location.pathname]);

  const navItems = [
    { key: "record", label: "中奖记录", path: "/record" },
    { key: "prize", label: "奖品设置", path: "/prize" },
    { key: "system", label: "系统设置", path: "/system" },
  ];

  const handleNavClick = (key) => {
    setActiveTab(key);
    const item = navItems.find((item) => item.key === key);
    if (item) {
      navigate(item.path);
    }
  };

  return (
    <Layout className="dashboard">
      <Header className="dashboard-header">
        <div className="header-content">
          <div className="logo-wrapper">
            <img src={logo} alt="Logo" className="header-logo" />
          </div>

          <div className="nav-center">
            {navItems.map((item) => (
              <Tooltip key={item.key} title={item.label}>
                <Button
                  type={activeTab === item.key ? "primary" : "text"}
                  className={`nav-btn ${
                    activeTab === item.key ? "active" : ""
                  }`}
                  onClick={() => handleNavClick(item.key)}
                >
                  {item.label}
                </Button>
              </Tooltip>
            ))}
          </div>
        </div>
      </Header>

      <Content className="dashboard-content">
        <Card className="content-card" variant="borderless">
          {activeTab === "prize" && <PrizeSettings />}
          {activeTab === "record" && <WinningRecords />}
          {activeTab === "system" && <SystemSettings />}
        </Card>
      </Content>
    </Layout>
  );
}

export default Dashboard;
