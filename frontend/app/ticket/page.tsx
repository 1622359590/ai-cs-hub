'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { ticketApi, authApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

const ticketTypes = [
  { value: 'bug', label: '问题反馈', icon: '🐛' },
  { value: 'feature', label: '功能建议', icon: '💡' },
  { value: 'consult', label: '咨询', icon: '💬' },
  { value: 'other', label: '其他', icon: '📋' },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: '待处理', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  processing: { label: '处理中', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  resolved: { label: '已解决', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
};

const typeLabels: Record<string, string> = {
  bug: '问题反馈',
  feature: '功能建议',
  consult: '咨询',
  other: '其他',
};

interface Attachment { url: string; filename: string; size: number; }

export default function TicketPage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 表单状态
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [groupName, setGroupName] = useState('');
  const [type, setType] = useState(ticketTypes[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 加载工单
  const loadTickets = useCallback(async (p: number, status: string, search: string) => {
    setLoading(true);
    try {
      const res = await ticketApi.getMyTickets({ status, search, page: p, pageSize });
      setTickets(res.tickets || []);
      setTotal(res.total || 0);
    } catch {}
    setLoading(false);
  }, [pageSize]);

  // 初始化
  useEffect(() => {
    const token = localStorage.getItem('imai-token');
    if (token) {
      authApi.getMe().then(res => {
        setLoggedIn(true);
        setName(res.user.nickname || '');
        setContact(res.user.phone || '');
        loadTickets(1, 'all', '');
      }).catch(() => {
        localStorage.removeItem('imai-token');
      });
    }
  }, [loadTickets]);

  // 筛选/搜索变化时重新加载
  useEffect(() => {
    if (loggedIn) {
      setPage(1);
      loadTickets(1, statusFilter, searchQuery);
    }
  }, [statusFilter, searchQuery, loggedIn, loadTickets]);

  // 搜索防抖
  const handleSearchInput = (val: string) => {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(val), 400);
  };

  // 翻页
  const handlePage = (newPage: number) => {
    setPage(newPage);
    loadTickets(newPage, statusFilter, searchQuery);
  };

  const totalPages = Math.ceil(total / pageSize);

  // 上传
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const token = localStorage.getItem('imai-token');
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload/file', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          setAttachments(prev => [...prev, { url: data.url, filename: data.filename || file.name, size: data.size || file.size }]);
          showToast(`${file.name} 已上传`, 'success');
        } else {
          showToast(data.error || `${file.name} 上传失败`, 'error');
        }
      } catch { showToast(`${file.name} 上传失败`, 'error'); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  };

  // 提交工单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { showToast('请输入工单标题', 'error'); return; }
    if (!loggedIn) { showToast('请先登录', 'error'); return; }
    setSubmitting(true);
    try {
      await ticketApi.submit({
        title: title.trim(), description, name, contact, type, group_name: groupName,
        attachments: attachments.map(a => ({ url: a.url, filename: a.filename })),
      });
      showToast('🎉 工单提交成功！', 'success');
      setTitle(''); setDescription(''); setAttachments([]); setGroupName('');
      setShowForm(false);
      loadTickets(1, statusFilter, searchQuery);
    } catch (err: any) {
      showToast(err.message || '提交失败', 'error');
    } finally { setSubmitting(false); }
  };

  // 统计（从全部数据算）
  const statusTabs = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待处理' },
    { key: 'processing', label: '处理中' },
    { key: 'resolved', label: '已解决' },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {/* 页面标题 */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">我的工单</h1>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                {total > 0 ? `共 ${total} 个工单` : '查看工单进度，需要帮助可以提交新工单'}
              </p>
            </div>
            {loggedIn && (
              <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm">
                {showForm ? '收起' : '+ 提交工单'}
              </button>
            )}
          </div>

          {!loggedIn ? (
            <div className="card text-center py-16">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-glow)]">
                <svg className="h-7 w-7 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">请先登录</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">登录后才能查看和提交工单</p>
              <button onClick={() => router.push('/login')} className="btn btn-primary mt-6">去登录</button>
            </div>
          ) : (
            <>
              {/* 提交新工单（折叠） */}
              {showForm && (
                <div className="card mb-6 border-[var(--accent)]/30">
                  <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">提交新工单</h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">工单类型</label>
                      <div className="grid grid-cols-4 gap-2">
                        {ticketTypes.map(t => (
                          <button key={t.value} type="button" onClick={() => setType(t.value)}
                            className={`flex items-center justify-center gap-1.5 rounded-lg p-2.5 border text-sm transition-all ${
                              type === t.value ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-light)]'
                            }`}>
                            <span>{t.icon}</span>
                            <span className="text-xs font-medium">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">标题 *</label>
                      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="简单描述你的问题" className="input" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">详细描述</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="越详细，处理越快" className="input" rows={3} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">附件</label>
                      <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-3 text-center hover:border-[var(--accent)] transition-colors">
                        <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.zip" className="hidden" onChange={handleUpload} />
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                          className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                          {uploading ? '上传中...' : '📎 点击上传附件'}
                        </button>
                      </div>
                      {attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {attachments.map((att, i) => (
                            <div key={i} className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-1.5 text-sm">
                              <span className="text-[var(--text-primary)] truncate">{att.filename} <span className="text-[var(--text-muted)] text-xs">{formatSize(att.size)}</span></span>
                              <button type="button" onClick={() => removeAttachment(i)} className="text-[var(--text-muted)] hover:text-red-500 ml-2">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">联系人</label><input value={name} onChange={e => setName(e.target.value)} className="input" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">联系方式</label><input value={contact} onChange={e => setContact(e.target.value)} className="input" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">售后群名</label><input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="选填" className="input" /></div>
                    </div>
                    <button type="submit" disabled={submitting} className="btn btn-primary w-full justify-center py-2.5">
                      {submitting ? '提交中...' : '提交工单'}
                    </button>
                  </form>
                </div>
              )}

              {/* 搜索 + 筛选 */}
              <div className="mb-4 space-y-3">
                {/* 搜索框 */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    value={searchInput}
                    onChange={e => handleSearchInput(e.target.value)}
                    placeholder="搜索工单标题或描述..."
                    className="input pl-10"
                  />
                  {searchInput && (
                    <button
                      onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                {/* 状态筛选 */}
                <div className="flex gap-1.5">
                  {statusTabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        statusFilter === tab.key
                          ? 'bg-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/25'
                          : 'bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent-light)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 工单列表 */}
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
                </div>
              ) : tickets.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {tickets.map((ticket: any) => {
                      const sc = statusConfig[ticket.status] || statusConfig.pending;
                      return (
                        <div key={ticket.id}
                          className="card cursor-pointer hover:border-[var(--accent)]/50 transition-all p-4 group"
                          onClick={() => router.push(`/ticket/${ticket.id}`)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">{ticket.title}</p>
                                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${sc.bg} ${sc.color}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                  {sc.label}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-1">{ticket.description || '无描述'}</p>
                            </div>
                            <svg className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                            <span className="tag text-[10px] py-0">{typeLabels[ticket.type] || ticket.type}</span>
                            <span>{ticket.created_at?.split(' ')[0]}</span>
                            {ticket.reply && <span className="text-[var(--accent)]">💬 有回复</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 分页 */}
                  {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between">
                      <p className="text-xs text-[var(--text-muted)]">
                        第 {page}/{totalPages} 页，共 {total} 条
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handlePage(page - 1)}
                          disabled={page <= 1}
                          className="btn btn-ghost btn-xs disabled:opacity-30"
                        >
                          ← 上一页
                        </button>
                        {/* 页码 */}
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (page <= 3) {
                            pageNum = i + 1;
                          } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = page - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePage(pageNum)}
                              className={`h-7 min-w-[28px] rounded-md text-xs font-medium transition-all ${
                                page === pageNum
                                  ? 'bg-[var(--accent)] text-white shadow-sm'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => handlePage(page + 1)}
                          disabled={page >= totalPages}
                          className="btn btn-ghost btn-xs disabled:opacity-30"
                        >
                          下一页 →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card text-center py-12">
                  {searchQuery || statusFilter !== 'all' ? (
                    <>
                      <p className="text-[var(--text-muted)]">没有找到匹配的工单</p>
                      <button onClick={() => { setSearchInput(''); setSearchQuery(''); setStatusFilter('all'); }}
                        className="btn btn-ghost btn-sm mt-3">清除筛选</button>
                    </>
                  ) : (
                    <>
                      <p className="text-[var(--text-muted)]">暂无工单</p>
                      <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm mt-3">提交第一个工单</button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
