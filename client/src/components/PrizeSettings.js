import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Space,
  Popconfirm,
  Spin,
  Upload,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { get, post, put, del } from '../utils/api.js';

function PrizeSettings() {
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // 初始加载奖品数据
  useEffect(() => {
    fetchPrizes();
  }, []);

  const fetchPrizes = async () => {
    setLoading(true);
    try {
      const response = await get('/prizes');
      if (!response.ok) {
        throw new Error('Failed to fetch prizes');
      }
      const data = await response.json();
      setPrizes(data);
    } catch (error) {
      console.error('Error fetching prizes:', error);
      message.error('加载奖品列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    setPreviewImage(null);
    form.resetFields();
    form.setFieldsValue({ supplier: '大连森林动物园' });
    setIsModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setPreviewImage(record.image);
    setIsModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingId) {
        // 更新奖品
        const response = await put(`/prizes/${editingId}`, values);

        if (!response.ok) {
          throw new Error('Failed to update prize');
        }

        const updatedPrize = await response.json();
        setPrizes(
          prizes.map((p) =>
            p.id === editingId ? updatedPrize : p
          )
        );
        message.success('编辑奖品成功');
      } else {
        // 添加新奖品
        const response = await post('/prizes', values);

        if (!response.ok) {
          throw new Error('Failed to create prize');
        }

        const newPrize = await response.json();
        setPrizes([...prizes, newPrize]);
        message.success('添加奖品成功');
      }

      setIsModalVisible(false);
      setPreviewImage(null);
    } catch (error) {
      console.error('Error saving prize:', error);
      message.error(editingId ? '编辑奖品失败' : '添加奖品失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setLoading(true);
      const response = await del(`/prizes/${id}`);

      if (!response.ok) {
        throw new Error('Failed to delete prize');
      }

      setPrizes(prizes.filter((p) => p.id !== id));
      message.success('删除成功');
    } catch (error) {
      console.error('Error deleting prize:', error);
      message.error('删除奖品失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理图片上传
  const handleImageUpload = ({ file }) => {
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target.result;
      form.setFieldValue('image', base64String);
      setPreviewImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  // 检查是否是 base64 图片
  const isBase64Image = (str) => {
    if (!str) return false;
    return str.startsWith('data:image');
  };

  const totalQuantity = prizes.reduce((sum, prize) => sum + (prize.quantity || 0), 0);

  const columns = [
    {
      title: '奖品名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '奖品图片',
      dataIndex: 'image',
      key: 'image',
      width: 100,
      align: 'center',
      render: (image) => {
        if (!image) {
          return <span style={{ color: '#ccc' }}>无</span>;
        }
        if (isBase64Image(image)) {
          return (
            <img
              src={image}
              alt="prize"
              style={{ maxWidth: '60px', maxHeight: '60px', borderRadius: '4px' }}
            />
          );
        }
        // 显示 emoji
        return (
          <div style={{ fontSize: 32 }}>
            {image}
          </div>
        );
      },
    },
    {
      title: '奖品数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      align: 'center',
    },
    {
      title: '中奖概率',
      dataIndex: 'probability',
      key: 'probability',
      width: 120,
      align: 'center',
      render: (_, record) => {
        if (totalQuantity === 0) {
          return <span>0%</span>;
        }
        const probability = ((record.quantity || 0) / totalQuantity * 100).toFixed(2);
        return <span>{probability}%</span>;
      },
    },
    {
      title: '奖品提供商',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      align: 'center',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => handleEdit(record)}
          >
            编辑奖品
          </Button>
          <Popconfirm
            title="删除确认"
            description="确定要删除此奖品吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger size="small">
              删除奖品
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="奖品设置"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={loading}>
            添加奖品
          </Button>
        }
      >
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={prizes}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            scroll={{ x: 1200 }}
            size="small"
          />
        </Spin>

        <Modal
          title={editingId ? '编辑奖品' : '添加奖品'}
          open={isModalVisible}
          onOk={handleSave}
          onCancel={() => setIsModalVisible(false)}
          okText="保存"
          cancelText="取消"
          width={600}
          confirmLoading={loading}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="奖品名称"
              rules={[{ required: true, message: '请输入奖品名称' }]}
            >
              <Input placeholder="请输入奖品名称" />
            </Form.Item>

            <Form.Item
              name="image"
              label="奖品图片"
            >
              <div>
                {previewImage && (
                  <div style={{ marginBottom: '12px' }}>
                    {isBase64Image(previewImage) ? (
                      <img
                        src={previewImage}
                        alt="preview"
                        onClick={() => {
                          document.getElementById('image-upload-input').click();
                        }}
                        style={{
                          maxWidth: '120px',
                          maxHeight: '120px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: '1px solid #d9d9d9',
                          padding: '4px',
                        }}
                        title="点击更换图片"
                      />
                    ) : (
                      <div
                        onClick={() => {
                          document.getElementById('image-upload-input').click();
                        }}
                        style={{
                          fontSize: 60,
                          cursor: 'pointer',
                          display: 'inline-block',
                          padding: '8px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px',
                        }}
                        title="点击更换图片"
                      >
                        {previewImage}
                      </div>
                    )}
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      点击图片可更换
                    </p>
                  </div>
                )}
                {!previewImage && (
                  <Upload
                    maxCount={1}
                    accept="image/*"
                    beforeUpload={() => false}
                    onChange={handleImageUpload}
                  >
                    <Button icon={<UploadOutlined />}>
                      选择图片 (最大 5MB)
                    </Button>
                  </Upload>
                )}
                <input
                  id="image-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImageUpload({ file });
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </div>
            </Form.Item>

            <Form.Item
              name="quantity"
              label="奖品数量"
              rules={[{ required: true, message: '请输入奖品数量' }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} placeholder="请输入奖品数量" />
            </Form.Item>

            <Form.Item
              name="supplier"
              label="奖品提供商"
              rules={[{ required: true, message: '请输入奖品提供商' }]}
            >
              <Input placeholder="请输入奖品提供商" />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </>
  );
}

export default PrizeSettings;
