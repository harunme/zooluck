import React, { useState, useEffect } from "react";
import { ConfigProvider, App as AntApp, theme, Spin } from "antd";
import "./App.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setIsLoggedIn(true);
    localStorage.setItem("user", JSON.stringify(userData));
    // 单独保存 token
    if (userData.token) {
      localStorage.setItem("token", userData.token);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  const customTheme = {
    token: {
      colorPrimary: "#2e8b57",
      colorInfo: "#2e8b57",
      colorSuccess: "#2e8b57",
      colorWarning: "#f0a830",
      colorBgBase: "#f8f9fa",
      borderRadius: 16,
      wireframe: false,
    },
  };

  return (
    <ConfigProvider theme={customTheme}>
      <AntApp>
        <div className="App">
          {loading ? (
            <div className="loading-container">
              <Spin size="large" tip="加载中..." />
            </div>
          ) : isLoggedIn ? (
            <Dashboard user={user} />
          ) : (
            <Login onLogin={handleLogin} />
          )}
        </div>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
