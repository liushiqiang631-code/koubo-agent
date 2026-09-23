// 统一的 API 请求封装
async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (body instanceof FormData) opts.body = body;
    else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(data?.error || `请求失败(${res.status})`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

// 数字人头像 URL（服务端 SVG）
export const avatarImg = (id, size = 400) => `/api/avatars/${id}/svg?size=${size}`;
export const mediaUrl = (u) => u;
