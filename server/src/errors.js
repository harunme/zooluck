export class ServiceError extends Error {
  constructor(code, message, status = 503, retryAfter = 1) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function sendError(res, error, shape = 'admin') {
  const status = error.status || (['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error.code) ? 503 : 500);
  const message = error.status ? error.message : status === 503 ? '系统繁忙，请稍后重试' : '系统错误，请稍后重试';
  if (status >= 500) console.error(JSON.stringify({ event: 'api_error', code: error.code || 'INTERNAL_ERROR' }));
  if (status === 429 || status === 503) res.set('Retry-After', String(error.retryAfter || 1));
  const body = { code: error.code || 'INTERNAL_ERROR' };
  if (shape === 'draw') Object.assign(body, { status: 2, prizename: message });
  else if (shape === 'exchange') Object.assign(body, { error: 1, msg: message });
  else Object.assign(body, { message });
  return res.status(status).json(body);
}

export function routeError(req, res, error) {
  const url = req.originalUrl || '';
  return sendError(res, error, url.startsWith('/api/lottery/draw') ? 'draw' : url.startsWith('/api/lottery/exchange') ? 'exchange' : 'admin');
}
