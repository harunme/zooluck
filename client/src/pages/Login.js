import React, { useState } from "react";
import { Form, Input, Button, Card, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { post } from "../utils/api.js";
import "./Login.css";
import backgroundImage from "./background.jpg";

function Login({ onLogin }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      const response = await post("/auth/login", {
        username: values.username,
        password: values.password,
      });

      const data = await response.json();

      if (data.success) {
        message.success("登录成功");
        onLogin(data.data);
      } else {
        message.error(data.message || "登录失败");
      }
    } catch (error) {
      message.error("服务器错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };

  const cardStyle = {
    borderRadius: 24,
    boxShadow: "0 10px 40px rgba(44, 95, 45, 0.25)",
  };

  return (
    <div className="login-container" style={containerStyle}>
      <Card className="login-card" variant="borderless" style={cardStyle}>
        <div className="login-header">
          <h1>🦒 大连森林动物园</h1>
        </div>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default Login;
