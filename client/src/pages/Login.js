import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import './Login.css';
import backgroundImage from './background.jpg';

function Login({ onLogin }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/login', {
        username: values.username,
        password: values.password
      });

      if (response.data.success) {
        message.success('登录成功');
        onLogin(response.data.data);
      } else {
        message.error(response.data.message || '登录失败');
      }
    } catch (error) {
      message.error(error.response?.data?.message || '服务器错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  const cardStyle = {
    borderRadius: 24,
    boxShadow: '0 10px 40px rgba(44, 95, 45, 0.25)',
  };

  return (
    <div className="login-container" style={containerStyle}>
      <Card className="login-card" bordered={false} style={cardStyle}>
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
            rules={[
              { required: true, message: '请输入用户名' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              size="large"
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
              登陆
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default Login;
