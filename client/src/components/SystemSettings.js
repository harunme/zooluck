import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Form,
  Input,
  message,
  Modal,
  Space,
  Popconfirm,
  Alert,
} from 'antd';
import { LockOutlined, SaveOutlined, WarningOutlined, LogoutOutlined } from '@ant-design/icons';
import { get, post, put } from '../utils/api.js';

const DEFAULT_PASSWORD = '1234';

function SystemSettings() {
  const [redeemForm] = Form.useForm();
  const [adminForm] = Form.useForm();
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [onLogout, setOnLogout] = useState(null);

  useEffect(() => {
    fetchRedeemPassword();
  }, []);

  const fetchRedeemPassword = async () => {
    try {
      const response = await get('/settings/redeem-password');
      if (response.ok) {
        const data = await response.json();
        if (data.value) {
          redeemForm.setFieldsValue({ redeemPassword: data.value });
          setCurrentPassword(data.value);
        }
      }
    } catch (error) {
      console.error('Error fetching password:', error);
    }
  };

  const handleSaveRedeemPassword = async () => {
    try {
      const values = await redeemForm.validateFields();
      setRedeemLoading(true);

      const response = await put('/settings/redeem-password', {
        redeemPassword: values.redeemPassword
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '保存失败');
      }

      message.success('兑奖密码已保存');
      setCurrentPassword(values.redeemPassword);
    } catch (error) {
      console.error('Error saving password:', error);
      message.error(error.message || '保存失败');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await adminForm.validateFields();
      setAdminLoading(true);

      const response = await post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '密码修改失败');
      }

      Modal.success({
        title: '密码修改成功',
        content: '下次登录请使用新密码',
        okText: '确定',
        onOk() {
          adminForm.resetFields();
        },
      });
    } catch (error) {
      console.error('Error changing password:', error);
      message.error(error.message || '密码修改失败');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleResetDefaultPassword = async () => {
    try {
      setRedeemLoading(true);
      const response = await put('/settings/redeem-password', {
        redeemPassword: DEFAULT_PASSWORD
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '重置失败');
      }

      redeemForm.setFieldsValue({ redeemPassword: DEFAULT_PASSWORD });
      setCurrentPassword(DEFAULT_PASSWORD);
      message.success('兑奖密码已恢复为默认密码');
    } catch (error) {
      console.error('Error resetting password:', error);
      message.error(error.message || '重置失败');
    } finally {
      setRedeemLoading(false);
    }
  };

  return (
    <div className="system-settings">
      <Card
        title="兑奖密码设置"
        extra={
          <Popconfirm
            title="确认恢复默认密码"
            description="确定要将兑奖密码恢复为默认密码吗？"
            icon={<WarningOutlined style={{ color: 'red' }} />}
            onConfirm={handleResetDefaultPassword}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger>
              恢复默认密码
            </Button>
          </Popconfirm>
        }
      >
        <Alert
          message="安全提示"
          description="兑奖密码用于管理员在兑奖时验证身份，请妥善保管。默认密码为 1234"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        <Form form={redeemForm} layout="vertical">
          <Form.Item
            name="redeemPassword"
            label="兑奖密码"
            rules={[
              { required: true, message: '请输入兑奖密码' },
              { min: 4, message: '密码长度不能少于4位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入兑奖密码（用于兑换奖品时验证）"
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveRedeemPassword}
              loading={redeemLoading}
            >
              保存兑奖密码
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="修改登录密码" style={{ marginTop: 24 }}>
        <Form form={adminForm} layout="vertical">
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入当前登录密码"
            />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 4, message: '密码长度不能少于4位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入新密码"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入新密码"
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleChangePassword}
              loading={adminLoading}
            >
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="账户操作"
        style={{ marginTop: 24 }}
        extra={
          <Popconfirm
            title="确认退出登录"
            description="确定要退出登录吗？"
            onConfirm={() => {
              localStorage.removeItem('user');
              localStorage.removeItem('token');
              window.location.href = '/';
            }}
            okText="确定"
            cancelText="取消"
          >
            <Button type="primary" danger icon={<LogoutOutlined />}>
              退出登录
            </Button>
          </Popconfirm>
        }
      >
        <Alert
          message="操作提示"
          description="退出登录后需要重新输入密码才能进入管理后台"
          type="warning"
          showIcon
        />
      </Card>
    </div>
  );
}

export default SystemSettings;
