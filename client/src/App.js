import React, { useState, useEffect } from "react";
import { ConfigProvider, App as AntApp, theme, Spin } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

  if (loading) {
    return (
      <ConfigProvider theme={customTheme}>
        <AntApp>
          <div className="loading-container">
            <Spin size="large" tip="加载中..." />
          </div>
        </AntApp>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={customTheme}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                isLoggedIn ? (
                  <Navigate to="/record" replace />
                ) : (
                  <Login onLogin={handleLogin} />
                )
              }
            />
            <Route
              path="/record"
              element={
                isLoggedIn ? (
                  <Dashboard user={user} defaultTab="record" onLogout={handleLogout} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/prize"
              element={
                isLoggedIn ? (
                  <Dashboard user={user} defaultTab="prize" onLogout={handleLogout} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/system"
              element={
                isLoggedIn ? (
                  <Dashboard user={user} defaultTab="system" onLogout={handleLogout} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/"
              element={
                isLoggedIn ? (
                  <Navigate to="/record" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
