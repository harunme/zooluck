import React, { useState } from "react";
import { Layout, Button, Dropdown, Space, Card, Tooltip } from "antd";
import PrizeSettings from "../components/PrizeSettings";
import WinningRecords from "../components/WinningRecords";
import SystemSettings from "../components/SystemSettings";
import logo from "./logo.png";
import "./Dashboard.css";

const { Header, Content } = Layout;

function Dashboard({ user }) {
  const [activeTab, setActiveTab] = useState("record");

  const navItems = [
    { key: "record", label: "中奖记录" },
    { key: "prize", label: "奖品设置" },
    { key: "system", label: "系统设置" },
  ];

  const handleNavClick = (key) => {
    setActiveTab(key);
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
