import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { get, post, put, del } from "../utils/api.js";
import PrizeArtwork from "./PrizeArtwork";

function PrizeSettings() {
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [editingPrize, setEditingPrize] = useState(null);
  const [stockConflict, setStockConflict] = useState(false);
  const fetchController = useRef(null);

  const fetchPrizes = useCallback(async (silent = false) => {
    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;
    if (!silent) setLoading(true);
    try {
      const response = await get("/prizes", { signal: controller.signal });
      if (!response.ok) {
        throw new Error("Failed to fetch prizes");
      }
      const data = await response.json();
      if (!controller.signal.aborted) setPrizes(data);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Error fetching prizes:");
      message.error(error.userMessage || "加载奖品列表失败");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrizes();
    return () => fetchController.current?.abort();
  }, [fetchPrizes]);

  useEffect(() => {
    if (isModalVisible || loading) return;
    const timer = setInterval(() => fetchPrizes(true), 15000);
    return () => clearInterval(timer);
  }, [fetchPrizes, isModalVisible, loading]);

  const handleAdd = () => {
    fetchController.current?.abort();
    setLoading(false);
    setEditingId(null);
    setEditingPrize(null);
    setStockConflict(false);
    setPreviewImage(null);
    form.resetFields();
    form.setFieldsValue({ supplier: "大连森林动物园" });
    setIsModalVisible(true);
  };

  const handleEdit = (record) => {
    fetchController.current?.abort();
    setLoading(false);
    setEditingId(record.id);
    setEditingPrize(record);
    setStockConflict(false);
    form.resetFields();
    form.setFieldsValue(record);
    setPreviewImage(record.image);
    setIsModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingId) {
        const changes = Object.fromEntries(
          Object.entries(values).filter(([key, value]) => value !== editingPrize[key])
        );
        if (Object.keys(changes).length === 0) {
          setIsModalVisible(false);
          return;
        }
        if (changes.quantity !== undefined) {
          changes.expectedQuantity = editingPrize.quantity;
        }
        const response = await put(`/prizes/${editingId}`, changes);

        if (response.status === 409) {
          setStockConflict(true);
          message.warning("库存已变化，输入已保留，请刷新核对库存后重试");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to update prize");
        }

        const updatedPrize = await response.json();
        setPrizes(current => current.map((p) => (p.id === editingId ? updatedPrize : p)));
        message.success("编辑奖品成功");
      } else {
        // 添加新奖品
        const response = await post("/prizes", values);

        if (!response.ok) {
          throw new Error("Failed to create prize");
        }

        const newPrize = await response.json();
        setPrizes(current => [...current, newPrize]);
        message.success("添加奖品成功");
      }

      setIsModalVisible(false);
      setPreviewImage(null);
    } catch (error) {
      console.error("Error saving prize:");
      message.error(error.userMessage || (editingId ? "编辑奖品失败" : "添加奖品失败"));
    } finally {
      setLoading(false);
    }
  };

  // Refresh the comparison baseline without discarding the operator's input.
  const refreshEditingStock = async () => {
    setLoading(true);
    try {
      const response = await get("/prizes");
      if (!response.ok) throw new Error("Failed to refresh stock");
      const data = await response.json();
      const latest = data.find(prize => prize.id === editingId);
      setPrizes(data);
      if (!latest) {
        message.warning("奖品已删除，请关闭编辑窗口");
        return;
      }
      setEditingPrize(current => ({ ...current, quantity: latest.quantity }));
      setStockConflict(false);
      message.info(`当前剩余可抽数量为 ${latest.quantity}，请核对输入后再保存`);
    } catch (error) {
      message.error(error.userMessage || "刷新库存失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    fetchController.current?.abort();
    try {
      setLoading(true);
      const response = await del(`/prizes/${id}`);

      if (!response.ok) {
        throw new Error("Failed to delete prize");
      }

      setPrizes(current => current.filter((p) => p.id !== id));
      message.success("删除成功");
    } catch (error) {
      console.error("Error deleting prize:");
      message.error(error.userMessage || "删除奖品失败");
    } finally {
      setLoading(false);
    }
  };

  // 处理图片上传
  const handleImageUpload = ({ file }) => {
    if (file.size > 5 * 1024 * 1024) {
      message.error("图片大小不能超过 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target.result;
      form.setFieldValue("image", base64String);
      setPreviewImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const totalQuantity = prizes.reduce(
    (sum, prize) => sum + (prize.quantity || 0),
    0
  );

  const columns = [
    {
      title: "奖品图片",
      dataIndex: "image",
      key: "image",
      width: 100,
      align: "center",
      render: image => <PrizeArtwork source={image} />,
    },
    {
      title: "奖品名称",
      dataIndex: "name",
      key: "name",
      width: 200,
    },

    {
      title: "剩余可抽数量",
      dataIndex: "quantity",
      key: "quantity",
      width: 120,
      align: "center",
    },
    {
      title: "中奖概率",
      dataIndex: "probability",
      key: "probability",
      width: 120,
      align: "center",
      render: (_, record) => {
        if (totalQuantity === 0) {
          return <span>0%</span>;
        }
        const probability = (
          ((record.quantity || 0) / totalQuantity) *
          100
        ).toFixed(2);
        return <span>{probability}%</span>;
      },
    },
    {
      title: "奖品提供商",
      dataIndex: "supplier",
      key: "supplier",
      width: 180,
    },
    {
      title: "操作",
      key: "action",
      align: "center",
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
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
          <Space>
            <Button onClick={() => fetchPrizes()} disabled={loading}>刷新</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              loading={loading}
            >
              添加奖品
            </Button>
          </Space>
        }
      >
        <p>中奖成功即扣减可抽数量，核销不重复扣减；列表每 15 秒自动刷新。</p>
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={prizes}
            rowKey="id"
            pagination={{
              pageSize: 10,
              shape: "default",
            }}
            scroll={{ x: 1200 }}
            size="large"
          />
        </Spin>

        <Modal
          title={editingId ? "编辑奖品" : "添加奖品"}
          open={isModalVisible}
          onOk={handleSave}
          onCancel={() => setIsModalVisible(false)}
          okText="保存"
          cancelText="取消"
          width={600}
          confirmLoading={loading}
        >
          <Form form={form} layout="vertical">
            {stockConflict && (
              <p role="alert">
                库存已变化，输入已保留。
                <Button onClick={refreshEditingStock} loading={loading}>刷新核对库存</Button>
              </p>
            )}
            <Form.Item
              name="name"
              label="奖品名称"
              rules={[{ required: true, message: "请输入奖品名称" }]}
            >
              <Input placeholder="请输入奖品名称" />
            </Form.Item>

            <Form.Item name="image" label="奖品图片">
              <div>
                {previewImage && (
                  <div style={{ marginBottom: "12px" }}>
                    <PrizeArtwork
                      source={previewImage}
                      size={120}
                      onClick={() => document.getElementById("image-upload-input").click()}
                    />
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#666",
                        marginTop: "4px",
                      }}
                    >
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
                  style={{ display: "none" }}
                />
              </div>
            </Form.Item>

            <Form.Item
              name="quantity"
              label="剩余可抽数量"
              extra="中奖即扣减；人工修改会直接设置可抽数量。历史未领取奖品请另行预留。"
              rules={[
                { required: true, message: "请输入剩余可抽数量" },
                { type: "integer", min: 0, max: Number.MAX_SAFE_INTEGER, message: "请输入非负安全整数" },
              ]}
            >
              <InputNumber
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                precision={0}
                style={{ width: "100%" }}
                placeholder="请输入剩余可抽数量"
              />
            </Form.Item>

            <Form.Item
              name="supplier"
              label="奖品提供商"
              rules={[{ required: true, message: "请输入奖品提供商" }]}
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
