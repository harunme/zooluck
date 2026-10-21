import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { Form, Modal } from "antd";
import { get, put, del } from "../utils/api.js";
import WinningRecords from "./WinningRecords";

jest.mock("../utils/api.js", () => ({ get: jest.fn(), put: jest.fn(), del: jest.fn() }));
jest.mock("antd", () => {
  const React = require("react");
  let values = {};
  const form = {
    setFieldsValue: next => { values = { ...values, ...next }; },
    validateFields: async () => values,
  };
  const Form = ({ children }) => <div>{children}</div>;
  Form.useForm = () => [form];
  Form.Item = ({ children }) => <div>{children}</div>;
  const wrapper = ({ children }) => <div>{children}</div>;
  const Modal = ({ open, children }) => open ? <div role="dialog">{children}</div> : null;
  Modal.confirm = jest.fn();
  const Radio = wrapper;
  Radio.Group = wrapper;
  return {
    Form, Modal, Radio, Card: wrapper, Space: wrapper,
    Button: ({ children, onClick, loading }) => <button onClick={onClick} disabled={loading}>{children}</button>,
    Input: ({ value, onChange, onPressEnter, disabled, placeholder }) => (
      <input value={value} onChange={onChange} disabled={disabled} placeholder={placeholder}
        onKeyDown={event => { if (event.key === "Enter") onPressEnter?.(); }} />
    ),
    Select: ({ value, options, onChange }) => (
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    ),
    Table: ({ columns, dataSource }) => <div data-testid="records">{dataSource.map((record, rowIndex) => (
      <div key={record.id}>{columns.map(column => (
        <span key={column.key}>{column.render ? column.render(record[column.dataIndex], record, rowIndex) : record[column.dataIndex]}</span>
      ))}</div>
    ))}</div>,
    Pagination: ({ current, onChange }) => <div data-current={current}>{[1,2,3].map(page => (
      <button key={page} onClick={() => onChange(page)}>第{page}页</button>
    ))}</div>,
    message: { success: jest.fn(), error: jest.fn() },
  };
});
jest.mock("@ant-design/icons", () => ({ SearchOutlined: () => null, DeleteOutlined: () => null }));

const row = { id: 21, prize_id: 1, vipcard: "card-first", phone: "phone", quantity: 1, status: 0, prize_name: "绘本", created_at: "2025-12-31 16:00:00" };
const pageData = (overrides = {}) => ({ items: [row], total: 21, page: 1, pageSize: 10, years: ["2026", "2025"], ...overrides });
const response = data => ({ ok: true, json: async () => data });
let root, container;

async function click(text) {
  const button = [...container.querySelectorAll("button")].find(node => node.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button.click());
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  get.mockResolvedValue(response(pageData()));
  put.mockResolvedValue(response({}));
  del.mockResolvedValue(response({}));
  Modal.confirm.mockImplementation(({ onOk }) => onOk());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<WinningRecords />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("loads one server page and uses global year options and server totals", async () => {
  expect(get.mock.calls[0][0]).toBe("/records?page=1&pageSize=10");
  expect(container.textContent).toContain("21");
  expect(container.querySelectorAll("option").length).toBe(3);
  expect(container.textContent).toContain("2026/01/01");
  get.mockResolvedValueOnce(response(pageData({ page: 2, items: [{ ...row, id: 11, vipcard: "card-second" }] })));
  await click("第2页");
  expect(get.mock.calls[1][0]).toBe("/records?page=2&pageSize=10");
  expect(container.textContent).toContain("card-second");
  expect(container.textContent).not.toContain("card-first");
});

test("typing does not download records until search is submitted; year changes reset page", async () => {
  const input = container.querySelector('input[placeholder="输入奖品名称搜索"]');
  await act(async () => Simulate.change(input, { target: { value: " 绘本_100% " } }));
  expect(get).toHaveBeenCalledTimes(1);
  await act(async () => Simulate.keyDown(input, { key: "Enter" }));
  expect(new URLSearchParams(get.mock.calls[1][0].split("?")[1]).get("keyword")).toBe("绘本_100%");
  await act(async () => Simulate.change(container.querySelector("select"), { target: { value: "2025" } }));
  const query = new URLSearchParams(get.mock.calls[2][0].split("?")[1]);
  expect(query.get("year")).toBe("2025");
  expect(query.get("page")).toBe("1");
});

test("an aborted older page response cannot replace a newer result", async () => {
  let resolveOld;
  let oldSignal;
  get.mockImplementationOnce((url, { signal }) => {
    oldSignal = signal;
    return new Promise(resolve => { resolveOld = resolve; });
  });
  await click("第2页");
  get.mockResolvedValueOnce(response(pageData({ page: 3, items: [{ ...row, id: 1, vipcard: "newest-result" }] })));
  await click("第3页");
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld(response(pageData({ page: 2, items: [{ ...row, vipcard: "stale-result" }] }))));
  expect(container.textContent).toContain("newest-result");
  expect(container.textContent).not.toContain("stale-result");
});

test("failed requests preserve data and allow retry", async () => {
  get.mockResolvedValueOnce({ ok: false });
  await click("刷新");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain("card-first");
  await click("重试");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("a mismatched server response shows retry instead of breaking the page", async () => {
  get.mockResolvedValueOnce(response([]));
  await click("刷新");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain("card-first");
});

test("deleting the last item accepts the server's previous-page fallback", async () => {
  get.mockResolvedValueOnce(response(pageData({ page: 3, items: [{ ...row, id: 1 }] })));
  await click("第3页");
  get.mockResolvedValue(response(pageData({ page: 2, total: 20, items: [{ ...row, id: 2 }] })));
  await click("删除");
  expect(del).toHaveBeenCalledWith("/records/1");
  expect(container.querySelector('[data-current="2"]')).not.toBeNull();
  expect(container.textContent).toContain("20");
  await click("刷新");
  expect(new URLSearchParams(get.mock.calls[get.mock.calls.length - 1][0].split("?")[1]).get("page")).toBe("2");
});

test("saving a record refreshes the page from the server", async () => {
  await click("编辑");
  Form.useForm()[0].setFieldsValue({ quantity: 1, status: 1 });
  get.mockResolvedValueOnce(response(pageData({ items: [{ ...row, status: 1 }] })));
  await click("保存");
  expect(put).toHaveBeenCalledWith("/records/21", { quantity: 1, status: 1 });
  expect(get).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain("已领取");
});
