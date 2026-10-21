import { apiRequest, post } from './api';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const response = (status, data) => ({
  status, ok: status < 400,
  json: async () => data,
  clone: () => ({ arrayBuffer: async () => new ArrayBuffer(0), json: async () => data }),
});

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn();
  localStorage.clear();
});
afterEach(() => { jest.useRealTimers(); delete global.fetch; });

test('backpressure and oversized-body responses surface their messages without automatic retries', async () => {
  for (const status of [413,429,503]) {
    fetch.mockResolvedValueOnce(response(status, { message: '请稍后重试' }));
    await expect(apiRequest('/prizes')).rejects.toMatchObject({ userMessage: '请稍后重试' });
  }
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('the default request deadline aborts a stalled connection', async () => {
  let signal;
  fetch.mockImplementationOnce((_, options) => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(abortError()));
  }));
  const pending = expect(apiRequest('/records')).rejects.toMatchObject({ userMessage: '请求超时，请刷新确认操作结果后再试' });
  jest.advanceTimersByTime(10000);
  await pending;
  expect(signal.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('the deadline remains active until the response body finishes', async () => {
  fetch.mockImplementationOnce(async (_, { signal }) => ({
    status: 200,
    clone: () => ({ arrayBuffer: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(abortError()))) }),
  }));
  const pending = expect(apiRequest('/records')).rejects.toMatchObject({ userMessage: '请求超时，请刷新确认操作结果后再试' });
  await Promise.resolve(); await Promise.resolve();
  jest.advanceTimersByTime(10000);
  await pending;
});

test('caller cancellation stays distinguishable from a transport error', async () => {
  fetch.mockImplementationOnce((_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(abortError()))));
  const controller = new AbortController();
  const pending = expect(apiRequest('/records', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await pending;
});

test('new image uploads have a 15-second deadline and are never retried', async () => {
  let signal;
  fetch.mockImplementationOnce((_, options) => new Promise((resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(abortError()));
  }));
  const pending = expect(post('/prizes', { image: 'data:image/png;base64,upload' })).rejects.toMatchObject({ userMessage: '请求超时，请刷新确认操作结果后再试' });
  jest.advanceTimersByTime(10000); expect(signal.aborted).toBe(false);
  jest.advanceTimersByTime(5000); await pending;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('incorrect login credentials do not trigger session-expiry navigation', async () => {
  localStorage.setItem('token', 'existing-token');
  fetch.mockResolvedValueOnce(response(401, { success: false, message: '用户名或密码错误' }));
  const result = await post('/auth/login', { username: 'admin', password: 'incorrect' });
  expect(result.status).toBe(401);
  expect(localStorage.getItem('token')).toBe('existing-token');
});
