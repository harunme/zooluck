import { formatBeijingTime } from "./dates";

test("SQLite UTC and ISO dates display the same Beijing time without double offset", () => {
  expect(formatBeijingTime("2025-12-31 16:00:00")).toContain("2026/01/01");
  expect(formatBeijingTime("2025-12-31 16:00:00")).toContain("00:00:00");
  expect(formatBeijingTime("2025-12-31 16:00:00")).toBe(formatBeijingTime("2025-12-31T16:00:00Z"));
  expect(formatBeijingTime("2025-12-31T16:00:00Z")).toBe(formatBeijingTime("2026-01-01T00:00:00+08:00"));
  expect(formatBeijingTime(null)).toBe("-");
  expect(formatBeijingTime("invalid")).toBe("-");
});
