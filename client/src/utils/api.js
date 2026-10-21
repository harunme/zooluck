const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * 获取认证 token
 */
export const getToken = () => {
  return localStorage.getItem('token');
};

/**
 * 清除认证信息并跳转到登录页
 */
export const clearAuthAndRedirect = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // 跳转到登录页
  window.location.href = '/login';
};

/**
 * 创建带有认证信息的请求头
 */
export const getAuthHeaders = () => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

/**
 * 统一的 API 请求方法
 * @param {string} endpoint - API 端点（不包含 /api 前缀）
 * @param {object} options - fetch 选项
 * @returns {Promise<Response>}
 */
export const apiRequest = async (endpoint, options = {}) => {
  const { timeoutMs = 10000, signal, ...requestOptions } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const friendly = text => Object.assign(new Error(text), { userMessage: text });
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...requestOptions, signal: controller.signal,
      headers: { ...getAuthHeaders(), ...requestOptions.headers },
    });
    // Keep the deadline active until the full JSON response has arrived.
    await response.clone().arrayBuffer();
    if (response.status === 401 && endpoint !== "/auth/login") {
      clearAuthAndRedirect();
      throw friendly("登录已过期，请重新登录");
    }
    if ([413, 429, 503].includes(response.status)) {
      const body = await response.clone().json().catch(() => ({}));
      throw friendly(body.message || body.prizename || body.msg || "服务繁忙，请稍后重试");
    }
    return response;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw friendly("请求超时，请刷新确认操作结果后再试");
    if (error.userMessage) throw error;
    throw friendly("网络请求失败，请稍后重试");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
};

/**
 * GET 请求
 */
export const get = (endpoint, options = {}) => {
  return apiRequest(endpoint, { ...options, method: 'GET' });
};

/**
 * POST 请求
 */
export const post = (endpoint, data, options = {}) => {
  return apiRequest(endpoint, {
    timeoutMs: typeof data?.image === 'string' && data.image.startsWith('data:') ? 15000 : 10000,
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  });
};

/**
 * PUT 请求
 */
export const put = (endpoint, data, options = {}) => {
  return apiRequest(endpoint, {
    timeoutMs: typeof data?.image === 'string' && data.image.startsWith('data:') ? 15000 : 10000,
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

/**
 * DELETE 请求
 */
export const del = (endpoint, options = {}) => {
  return apiRequest(endpoint, { ...options, method: 'DELETE' });
};

export default {
  get,
  post,
  put,
  delete: del,
  getToken,
  getAuthHeaders,
};
