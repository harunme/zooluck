import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Input,
  Button,
  Space,
  Pagination,
  Select,
  Modal,
  Form,
  Radio,
  message,
  Spin,
} from "antd";
import { SearchOutlined, DeleteOutlined } from "@ant-design/icons";
import { get, put, del } from "../utils/api.js";

function WinningRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  // 获取中奖记录
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const response = await get("/records");
      const data = await response.json();
      const formattedRecords = data.map((record) => ({
        ...record,
        key: record.id,
      }));
      setRecords(formattedRecords);
    } catch (error) {
      console.error("Failed to fetch records:", error);
      message.error("获取中奖记录失败");
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取数据
  useEffect(() => {
    fetchRecords();
  }, []);

  const years = useMemo(() => {
    const yearSet = new Set();
    records.forEach((r) => {
      if (r.created_at) {
        const year = new Date(r.created_at).getFullYear().toString();
        yearSet.add(year);
      }
    });
    return Array.from(yearSet).sort().reverse();
  }, [records]);

  const filteredRecords = useMemo(() => {
    let filtered = records;

    if (selectedYear !== "all") {
      filtered = filtered.filter((r) => {
        if (r.created_at) {
          const year = new Date(r.created_at).getFullYear().toString();
          return year === selectedYear;
        }
        return false;
      });
    }

    if (searchTerm) {
      filtered = filtered.filter((r) => {
        const prizeNameMatch =
          r.prize_name &&
          r.prize_name.toLowerCase().includes(searchTerm.toLowerCase());
        return prizeNameMatch;
      });
    }

    return filtered;
  }, [records, searchTerm, selectedYear]);

  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleEdit = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      prizeId: record.prize_id,
      prizeName: record.prize_name,
      quantity: record.quantity,
      status: record.status,
    });
    setIsModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      const response = await put(`/records/${editingRecord.id}`, {
        quantity: parseInt(values.quantity),
        status: parseInt(values.status),
      });

      if (!response.ok) {
        throw new Error("Failed to save record");
      }

      setRecords(
        records.map((r) =>
          r.id === editingRecord.id
            ? {
                ...r,
                quantity: parseInt(values.quantity),
                status: parseInt(values.status),
              }
            : r
        )
      );
      setIsModalVisible(false);
      message.success("保存成功");
    } catch (error) {
      console.error("Failed to save record:", error);
      message.error("保存失败");
    }
  };

  const handleDelete = async (id) => {
    Modal.confirm({
      title: "删除记录",
      content: "确定要删除这条中奖记录吗？",
      okText: "确定",
      cancelText: "取消",
      onOk: async () => {
        try {
          const response = await del(`/records/${id}`);
          if (!response.ok) {
            throw new Error("Failed to delete record");
          }
          setRecords(records.filter((r) => r.id !== id));
          message.success("删除成功");
        } catch (error) {
          console.error("Failed to delete record:", error);
          message.error("删除失败");
        }
      },
    });
  };

  // 检查是否是 base64 图片
  const isBase64Image = (str) => {
    if (!str) return false;
    return str.startsWith("data:image");
  };

  const columns = [
    {
      title: "序号",
      dataIndex: "id",
      key: "id",
      width: 60,
      align: "center",
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },

    {
      title: "会员卡号",
      dataIndex: "vipcard",
      key: "vipcard",
      width: 150,
      render: (text) => text || "-",
    },
    {
      title: "手机号",
      dataIndex: "phone",
      key: "phone",
      width: 130,
      render: (text) => text || "-",
    },
    {
      title: "奖品图片",
      dataIndex: "prize_image",
      key: "prize_image",
      width: 100,
      align: "center",
      render: (image) => {
        if (!image) {
          return (
            <span
              style={{
                color: "#ccc",
                lineHeight: "42px",
                display: "block",
                height: "42px",
              }}
            ></span>
          );
        }
        if (isBase64Image(image)) {
          return (
            <img
              src={image}
              alt="prize"
              style={{
                maxWidth: "42px",
                maxHeight: "42px",
                borderRadius: "4px",
                display: "block",
                margin: "0 auto",
              }}
            />
          );
        }
        // 显示 emoji
        return (
          <div style={{ fontSize: 32, lineHeight: "60px", height: "60px" }}>
            {image}
          </div>
        );
      },
    },
    {
      title: "奖品名称",
      dataIndex: "prize_name",
      key: "prize_name",
      width: 150,
    },
    {
      title: "数量",
      dataIndex: "quantity",
      key: "quantity",
      width: 80,
      align: "center",
    },
    {
      title: "类型",
      dataIndex: "record_type",
      key: "record_type",
      width: 100,
      align: "center",
      render: (text) => {
        const typeMap = { draw: "抽奖", redeem: "兑奖" };
        return typeMap[text] || text;
      },
    },
    {
      title: "是否已领奖",
      dataIndex: "status",
      key: "status",
      width: 100,
      align: "center",
      render: (text) => {
        const statusMap = { 0: "未领取", 1: "已领取" };
        return statusMap[text] || "-";
      },
    },
    {
      title: "中奖时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (text) => {
        if (!text) return "-";
        return new Date(text).toLocaleString("zh-CN");
      },
    },
    {
      title: "操作",
      key: "operation",
      width: 120,
      align: "center",
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const yearOptions = [
    { label: "全部年份", value: "all" },
    ...years.map((year) => ({ label: `${year}年中奖记录`, value: year })),
  ];

  return (
    <Card title="中奖记录">
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Space wrap>
            <Input
              placeholder="输入奖品名称搜索"
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: 250 }}
            />
            <Select
              value={selectedYear}
              onChange={(value) => {
                setSelectedYear(value);
                setCurrentPage(1);
              }}
              options={yearOptions}
              style={{ width: 150 }}
            />
            <Button
              type="primary"
              onClick={() => {
                setCurrentPage(1);
              }}
            >
              搜索
            </Button>
          </Space>

          <Table
            columns={columns}
            dataSource={paginatedRecords}
            rowKey="id"
            pagination={false}
            scroll={{ x: 1200 }}
            size="small"
            loading={loading}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              共 <strong>{filteredRecords.length}</strong> 条记录，第{" "}
              <strong>{currentPage}</strong> 页
            </span>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredRecords.length}
              onChange={setCurrentPage}
              showSizeChanger={false}
            />
          </div>
        </Space>

        <Modal
          title="编辑中奖记录"
          open={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width={500}
        >
          <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
            <Form.Item name="prizeName" label="奖品名称：">
              <Input disabled />
            </Form.Item>

            <Form.Item
              name="quantity"
              label="数量："
              rules={[
                { required: true, message: "请输入数量" },
                { pattern: /^[1-9]\d*$/, message: "数量必须为正整数" },
              ]}
            >
              <Input type="number" min={1} />
            </Form.Item>

            <Form.Item
              name="status"
              label="是否已领奖："
              rules={[{ required: true, message: "请选择领奖状态" }]}
            >
              <Radio.Group>
                <Radio value={0}>未领取</Radio>
                <Radio value={1}>已领取</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: "center" }}>
              <Space>
                <Button
                  type="primary"
                  onClick={handleSave}
                  style={{ width: 100 }}
                >
                  保存
                </Button>
                <Button
                  onClick={() => setIsModalVisible(false)}
                  style={{ width: 100 }}
                >
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
  );
}

export default WinningRecords;
