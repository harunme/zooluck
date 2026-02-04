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
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  // 检查是否为 401 错误（token 无效或过期）
  if (response.status === 401) {
    clearAuthAndRedirect();
    throw new Error('登录已过期，请重新登录');
  }

  return response;
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
