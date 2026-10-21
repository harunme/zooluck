import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Form, message } from "antd";
import { get, put } from "../utils/api.js";
import PrizeSettings from "./PrizeSettings";

jest.mock("../utils/api.js", () => ({
  get: jest.fn(), put: jest.fn(), post: jest.fn(), del: jest.fn(),
}));

// Keep these tests focused on the inventory editing workflow, with a lightweight
// form/table adapter instead of Ant Design's layout and animation machinery.
jest.mock("antd", () => {
  const React = require("react");
  let values = {};
  const form = {
    resetFields: () => { values = {}; },
    setFieldsValue: next => { values = { ...values, ...next }; },
    setFieldValue: (key, value) => { values[key] = value; },
    validateFields: async () => Object.fromEntries(
      ["name", "image", "quantity", "supplier"].map(key => [key, values[key]])
    ),
  };
  const Form = ({ children }) => <div>{children}</div>;
  Form.useForm = () => [form];
  Form.Item = ({ children, label }) => <label>{label}{children}</label>;
  const wrapper = ({ children }) => <div>{children}</div>;
  return {
    Form,
    Card: ({ children, extra }) => <div>{extra}{children}</div>,
    Button: ({ children, onClick, disabled, loading }) => (
      <button onClick={onClick} disabled={disabled || loading}>{children}</button>
    ),
    Table: ({ columns, dataSource }) => <div>{dataSource.map(record => (
      <div key={record.id}>{columns.map(column => (
        <div key={column.key}>{column.render ? column.render(record[column.dataIndex], record) : record[column.dataIndex]}</div>
      ))}</div>
    ))}</div>,
    Modal: ({ open, children, onOk, onCancel, confirmLoading }) => open ? (
      <div role="dialog">{children}
        <button onClick={onOk} disabled={confirmLoading}>保存</button>
        <button onClick={onCancel}>取消</button>
      </div>
    ) : null,
    Input: () => <input />,
    InputNumber: () => <input />,
    Space: wrapper, Popconfirm: wrapper, Spin: wrapper, Upload: wrapper,
    message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
  };
});
jest.mock("@ant-design/icons", () => ({ PlusOutlined: () => null, UploadOutlined: () => null }));

const original = { id: 1, name: "奖品", image: "", quantity: 10, supplier: "动物园" };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
let container;
let root;

async function click(text) {
  const button = [...container.querySelectorAll("button")].find(node => node.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button.click());
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  Form.useForm()[0].resetFields();
  get.mockResolvedValue(response([original]));
  put.mockResolvedValue(response(original));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PrizeSettings />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("editing only the name never submits the stale stock quantity", async () => {
  get.mockResolvedValueOnce(response([{ ...original, image: `/api/prizes/1/image/${"a".repeat(64)}` }]));
  await click("刷新");
  await click("编辑奖品");
  Form.useForm()[0].setFieldValue("name", "新奖品名");
  await click("保存");
  expect(put).toHaveBeenCalledWith("/prizes/1", { name: "新奖品名" });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

test("replacing a cached artwork submits the new upload and leaves stock untouched", async () => {
  get.mockResolvedValueOnce(response([{ ...original, image: `/api/prizes/1/image/${"a".repeat(64)}` }]));
  await click("刷新");
  await click("编辑奖品");
  const upload = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+1sAAAAASUVORK5CYII=";
  Form.useForm()[0].setFieldValue("image", upload);
  await click("保存");
  expect(put).toHaveBeenCalledWith("/prizes/1", { image: upload });
});

test("stock conflict preserves input and refreshes the comparison before retry", async () => {
  await click("编辑奖品");
  Form.useForm()[0].setFieldValue("quantity", 20);
  put.mockResolvedValueOnce(response({}, 409));
  await click("保存");
  expect(put).toHaveBeenLastCalledWith("/prizes/1", { quantity: 20, expectedQuantity: 10 });
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect((await Form.useForm()[0].validateFields()).quantity).toBe(20);
  expect(message.warning).toHaveBeenCalled();

  get.mockResolvedValueOnce(response([{ ...original, quantity: 8 }]));
  await click("刷新核对库存");
  expect((await Form.useForm()[0].validateFields()).quantity).toBe(20);
  await click("保存");
  expect(put).toHaveBeenLastCalledWith("/prizes/1", { quantity: 20, expectedQuantity: 8 });
});

test("polling updates stock every 15 seconds and pauses during editing", async () => {
  get.mockResolvedValueOnce(response([{ ...original, quantity: 7 }]));
  await act(async () => jest.advanceTimersByTime(15000));
  expect(get).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("7");
  await click("编辑奖品");
  await act(async () => jest.advanceTimersByTime(30000));
  expect(get).toHaveBeenCalledTimes(2);
  await click("取消");
  await act(async () => jest.advanceTimersByTime(15000));
  expect(get).toHaveBeenCalledTimes(3);
});

test("opening the editor aborts an old refresh so it cannot overwrite saved stock", async () => {
  let resolveRefresh;
  let refreshSignal;
  get.mockImplementationOnce((_, { signal }) => {
    refreshSignal = signal;
    return new Promise(resolve => { resolveRefresh = resolve; });
  });
  await act(async () => jest.advanceTimersByTime(15000));
  await click("编辑奖品");
  expect(refreshSignal.aborted).toBe(true);
  Form.useForm()[0].setFieldValue("quantity", 5);
  put.mockResolvedValueOnce(response({ ...original, quantity: 5 }));
  await click("保存");
  await act(async () => resolveRefresh(response([original])));
  expect(container.textContent).toContain("5");
  await click("编辑奖品");
  expect((await Form.useForm()[0].validateFields()).quantity).toBe(5);
});
