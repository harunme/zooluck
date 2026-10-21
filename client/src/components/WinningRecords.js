import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "antd";
import { SearchOutlined, DeleteOutlined } from "@ant-design/icons";
import { get, put, del } from "../utils/api.js";
import PrizeArtwork from "./PrizeArtwork";
import { formatBeijingTime } from "../utils/dates.js";

function WinningRecords() {
  const [result, setResult] = useState({ items: [], total: 0, page: 1, years: [] });
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState({ page: 1, keyword: "", year: "all" });
  const [reload, setReload] = useState(0);
  const requestSequence = useRef(0);
  const fetchController = useRef(null);
  const pageSize = 10;
  const currentPage = result.page;
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const fetchRecords = useCallback(async () => {
    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const parameters = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
      if (query.keyword) parameters.set("keyword", query.keyword);
      if (query.year !== "all") parameters.set("year", query.year);
      const response = await get(`/records?${parameters}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Failed to fetch records");
      const data = await response.json();
      if (!Array.isArray(data.items) || !Array.isArray(data.years) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.page) || data.page < 1) {
        throw new Error("Invalid records response");
      }
      if (!controller.signal.aborted && sequence === requestSequence.current) {
        setResult(data);
        if (data.page !== query.page) {
          setQuery(current => current === query ? { ...current, page: data.page } : current);
        }
      }
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setLoadFailed(true);
      message.error(error.userMessage || "获取中奖记录失败，请重试");
    } finally {
      if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchRecords();
    return () => {
      fetchController.current?.abort();
      requestSequence.current += 1;
    };
  }, [fetchRecords, reload]);

  const submitSearch = () => setQuery(current => ({ ...current, keyword: searchTerm.trim(), page: 1 }));

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

      setReload(value => value + 1);
      setIsModalVisible(false);
      message.success("保存成功");
    } catch (error) {
      console.error("Failed to save record:");
      message.error(error.userMessage || "保存失败");
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
          setReload(value => value + 1);
          message.success("删除成功");
        } catch (error) {
          console.error("Failed to delete record:");
          message.error(error.userMessage || "删除失败");
        }
      },
    });
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
      render: image => <PrizeArtwork source={image} />,
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
      render: formatBeijingTime,
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
    ...result.years.map((year) => ({ label: `${year}年中奖记录`, value: year })),
  ];

  return (
    <Card title="中奖记录">
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Space wrap>
            <Input
              placeholder="输入奖品名称搜索"
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              onPressEnter={submitSearch}
              maxLength={100}
              style={{ width: 250 }}
            />
            <Select
              value={query.year}
              onChange={(value) => {
                setQuery(current => ({ ...current, year: value, page: 1 }));
              }}
              options={yearOptions}
              style={{ width: 150 }}
            />
            <Button
              type="primary"
              onClick={submitSearch}
            >
              搜索
            </Button>
            <Button onClick={() => setReload(value => value + 1)} loading={loading}>刷新</Button>
          </Space>

          {loadFailed && <p role="alert">加载失败，已保留原有记录。<Button onClick={() => setReload(value => value + 1)}>重试</Button></p>}
          <Table
            columns={columns}
            dataSource={result.items}
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
              共 <strong>{result.total}</strong> 条记录，第{" "}
              <strong>{currentPage}</strong> 页
            </span>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={result.total}
              onChange={page => setQuery(current => ({ ...current, page }))}
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
