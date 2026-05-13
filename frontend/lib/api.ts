const BASE_URL = '/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('imai-token');
}

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('imai-admin-token');
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // 304 Not Modified — 缓存命中，重新请求一次
  if (res.status === 304) {
    const retryRes = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, 'Cache-Control': 'no-cache' },
    });
    if (retryRes.ok) return retryRes.json();
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('服务器返回异常，请检查后端是否运行');
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || '请求失败');
  }

  return data;
}

// ===== 管理员 API（使用 imai-admin-token）=====
async function fetchAdminAPI(endpoint: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // 304 Not Modified — 缓存命中，重新请求一次
  if (res.status === 304) {
    const retryRes = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, 'Cache-Control': 'no-cache' },
    });
    if (retryRes.ok) return retryRes.json();
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('服务器返回异常，请检查后端是否运行');
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || '请求失败');
  }

  return data;
}

// ========== 认证 ==========
export const authApi = {
  register: (phone: string, password: string, nickname?: string) =>
    fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone, password, nickname }),
    }),
  login: (phone: string, password: string) =>
    fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),
  getMe: () => fetchAPI('/auth/me'),
};

// ========== 教程（公开）==========
export const tutorialApi = {
  getList: (params?: { category?: string; search?: string; page?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    const qs = searchParams.toString();
    return fetchAPI(`/tutorials${qs ? `?${qs}` : ''}`);
  },
  getDetail: (id: number | string) => fetchAPI(`/tutorials/${id}`),
};

// ========== FAQ（公开）==========
export const faqApi = {
  getList: (params?: { category?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return fetchAPI(`/faqs${qs ? `?${qs}` : ''}`);
  },
};

// ========== 管理后台（使用 imai-admin-token）==========
export const adminApi = {
  // 教程管理
  getTutorials: (params?: { category?: string; search?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);
    const qs = searchParams.toString();
    return fetchAdminAPI(`/admin/tutorials${qs ? `?${qs}` : ''}`);
  },
  getTutorial: (id: number | string) => fetchAdminAPI(`/admin/tutorials/${id}`),
  createTutorial: (data: {
    title: string;
    category: string;
    content: string;
    summary?: string;
    cover?: string;
    tags?: string;
    status?: string;
    vip_only?: boolean | number;
  }) =>
    fetchAdminAPI('/admin/tutorials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTutorial: (id: number | string, data: {
    title?: string;
    category?: string;
    content?: string;
    summary?: string;
    cover?: string;
    tags?: string;
    status?: string;
    vip_only?: boolean | number;
  }) =>
    fetchAdminAPI(`/admin/tutorials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTutorial: (id: number | string) =>
    fetchAdminAPI(`/admin/tutorials/${id}`, { method: 'DELETE' }),

  // FAQ 管理
  getFaqs: () => fetchAdminAPI('/admin/faqs'),
  createFaq: (data: {
    question: string;
    answer: string;
    category?: string;
    sort_order?: number;
    pinned?: number;
    status?: string;
  }) =>
    fetchAdminAPI('/admin/faqs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateFaq: (id: number | string, data: {
    question?: string;
    answer?: string;
    category?: string;
    sort_order?: number;
    pinned?: number;
    status?: string;
  }) =>
    fetchAdminAPI(`/admin/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFaq: (id: number | string) =>
    fetchAdminAPI(`/admin/faqs/${id}`, { method: 'DELETE' }),

  // 设置
  getSettings: () => fetchAdminAPI('/admin/settings'),
  saveSettings: (data: Record<string, string>) =>
    fetchAdminAPI('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 统计
  getStats: () => fetchAdminAPI('/admin/stats'),

  // 用户管理
  getUsers: () => fetchAdminAPI('/admin/users'),
  createUser: (data: { phone: string; password: string; nickname?: string }) =>
    fetchAdminAPI('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  setVIP: (userId: number, data: { vip: number; vip_expires_at: string }) =>
    fetchAdminAPI(`/admin/users/${userId}/vip`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 工单管理
  getTickets: (status?: string) => fetchAdminAPI(`/admin/tickets${status ? `?status=${status}` : ''}`),
  getTicketStats: () => fetchAdminAPI('/admin/tickets/stats'),
  updateTicket: (id: number | string, data: { status?: string; reply?: string }) =>
    fetchAdminAPI(`/admin/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 分类管理
  getAdminCategories: () => fetchAdminAPI('/admin/categories'),
  createCategory: (data: { name: string; icon?: string }) =>
    fetchAdminAPI('/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number | string, data: { name?: string; icon?: string; sort_order?: number }) =>
    fetchAdminAPI(`/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number | string) =>
    fetchAdminAPI(`/admin/categories/${id}`, { method: 'DELETE' }),

  // 知识库
  getKnowledge: () => fetchAdminAPI('/admin/knowledge'),
  createKnowledge: (data: { title: string; content?: string; tags?: string[]; category?: string }) =>
    fetchAdminAPI('/admin/knowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteKnowledge: (id: number | string) =>
    fetchAdminAPI(`/admin/knowledge/${id}`, { method: 'DELETE' }),

  // 管理员管理
  getAdmins: () => fetchAdminAPI('/admin/admins'),
  createAdmin: (data: { username: string; password: string; nickname?: string; role?: string }) =>
    fetchAdminAPI('/admin/admins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteAdmin: (id: number | string) =>
    fetchAdminAPI(`/admin/admins/${id}`, { method: 'DELETE' }),

  // 客户身份分类管理
  getCustomerLevels: () => fetchAdminAPI('/admin/customer-levels'),
  createCustomerLevel: (data: { name: string; description?: string; sort_order?: number }) =>
    fetchAdminAPI('/admin/customer-levels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCustomerLevel: (id: number | string, data: { name?: string; description?: string; sort_order?: number }) =>
    fetchAdminAPI(`/admin/customer-levels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCustomerLevel: (id: number | string) =>
    fetchAdminAPI(`/admin/customer-levels/${id}`, { method: 'DELETE' }),

  // 更新用户信息
  updateUser: (userId: number, data: { nickname?: string; vip?: number; vip_expires_at?: string; customer_level_id?: number }) =>
    fetchAdminAPI(`/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 导出用户 CSV
  exportUsers: async () => {
    const token = getAdminToken();
    const res = await fetch('/api/admin/users/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  // 导入用户 CSV
  importUsers: async (file: File) => {
    const token = getAdminToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/users/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    // FormData 不要手动设 Content-Type，让浏览器自动加 boundary
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '导入失败');
    return data;
  },
};

// ========== 工单 ==========
export const ticketApi = {
  submit: (data: {
    title: string;
    description?: string;
    name?: string;
    contact?: string;
    type?: string;
    group_name?: string;
    attachments?: any[];
  }) =>
    fetchAPI("/tickets", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getMyTickets: (params?: { status?: string; search?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    const qs = q.toString();
    return fetchAPI(`/user/tickets${qs ? '?' + qs : ''}`);
  },
  getTicket: (id: number | string) => fetchAPI(`/tickets/${id}`),
};

// ========== AI 客服 ==========
export const aiApi = {
  getConversations: () => fetchAPI('/ai/conversations'),
  createConversation: (guestName?: string) =>
    fetchAPI('/ai/conversations', {
      method: 'POST',
      body: JSON.stringify({ guest_name: guestName || '' }),
    }),
  sendMessage: (conversationId: number, message: string, imageUrl?: string) =>
    fetchAPI('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, message, image_url: imageUrl || '' }),
    }),
  getMessages: (conversationId: number) =>
    fetchAPI(`/ai/conversations/${conversationId}/messages`),
  rateMessage: (messageId: number, rating: number) =>
    fetchAPI(`/ai/messages/${messageId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),
  transferToHuman: (conversationId: number, data?: { title?: string; type?: string; group_name?: string }) =>
    fetchAPI(`/ai/conversations/${conversationId}/transfer`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  endConversation: (conversationId: number) =>
    fetchAPI(`/ai/conversations/${conversationId}/end`, {
      method: 'POST',
    }),
};

// ========== AI 管理 ==========
export const aiAdminApi = {
  getConversations: () => fetchAdminAPI('/admin/ai/conversations'),
  getKnowledge: () => fetchAdminAPI('/admin/ai/knowledge'),
  createKnowledge: (data: { title: string; content: string; category?: string; tags?: string[] }) =>
    fetchAdminAPI('/admin/ai/knowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateKnowledge: (id: number, data: { title?: string; content?: string; category?: string; status?: string }) =>
    fetchAdminAPI(`/admin/ai/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteKnowledge: (id: number) =>
    fetchAdminAPI(`/admin/ai/knowledge/${id}`, { method: 'DELETE' }),
  importKnowledge: async (items: { title: string; content: string; category?: string }[]) => {
    const token = getAdminToken();
    const res = await fetch('/api/admin/ai/knowledge/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '导入失败');
    return data;
  },
  previewKnowledge: async (file: File) => {
    const token = getAdminToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/ai/knowledge/preview', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '解析失败');
    return data as { items: { title: string; content: string; category: string }[]; count: number };
  },
  // 批量上传图片
  uploadImages: async (files: File[]) => {
    const token = getAdminToken();
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await fetch('/api/admin/upload/images', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data as { message: string; files: { url: string; filename: string; size: number }[] };
  },
  // 获取已上传图片列表
  getImages: () => fetchAdminAPI('/admin/upload/images'),
};

// ========== 分类 ==========
export const categoryApi = {
  getList: () => fetchAPI("/categories"),
};
