'use client';

import { useState, useEffect } from 'react';
import { aiAdminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

interface Conversation {
  id: number;
  user_id: number;
  guest_name: string;
  status: string;
  nickname: string;
  phone: string;
  message_count: number;
  last_message: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  role: string;
  content: string;
  image_url: string;
  rating: number;
  created_at: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pagedConvs = conversations.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    aiAdminApi.getConversations()
      .then(res => setConversations(res.conversations || []))
      .catch(() => showToast('获取对话列表失败', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const openConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/ai/conversations/${conv.id}/messages`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('imai-admin-token')}` },
      });
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      showToast('获取消息失败', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCloseConv = async (convId: number) => {
    if (!confirm('确定关闭此对话？')) return;
    try {
      const res = await fetch(`/api/ai/conversations/${convId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('imai-admin-token')}` },
      });
      if (!res.ok) throw new Error('关闭失败');
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: 'closed' } : c));
      if (selectedConv?.id === convId) setSelectedConv(prev => prev ? { ...prev, status: 'closed' } : null);
      showToast('对话已关闭', 'success');
    } catch {
      showToast('关闭失败', 'error');
    }
  };

  const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: '进行中', color: 'text-[#2563eb]', bg: 'bg-[#dbeafe]' },
    transferred: { label: '已转人工', color: 'text-[#d97706]', bg: 'bg-[#fef3c7]' },
    closed: { label: '已关闭', color: 'text-[#94a3b8]', bg: 'bg-[#f1f5f9]' },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-[#1e293b]">AI 对话记录</h1>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 200px)' }}>
        {/* 左侧对话列表 */}
        <div className="w-80 flex-shrink-0 card overflow-y-auto p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#94a3b8]">暂无对话记录</div>
          ) : (
            <div className="divide-y divide-[#e2e8f0]">
              {pagedConvs.map(conv => {
                const sl = statusLabels[conv.status] || statusLabels.active;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full p-3 text-left transition-colors hover:bg-[#f8fafc] ${selectedConv?.id === conv.id ? 'bg-[#f5f3ff]' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#1e293b] truncate">
                        {conv.nickname || conv.guest_name || conv.phone || `访客${conv.id}`}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sl.bg} ${sl.color}`}>{sl.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#94a3b8] truncate">{conv.last_message}</p>
                    <p className="mt-1 text-[10px] text-[#cbd5e1]">{conv.message_count} 条消息 · {conv.updated_at?.split('.')[0]?.replace('T', ' ')}</p>
                  </button>
                );
              })}
            </div>
          )}
          <Pagination page={page} total={conversations.length} pageSize={pageSize} onChange={setPage} />
        </div>

        {/* 右侧消息详情 */}
        <div className="flex-1 card flex flex-col p-0 overflow-hidden">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[#94a3b8]">
              ← 选择一个对话查看详情
            </div>
          ) : (
            <>
              {/* 头部 */}
              <div className="border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1e293b]">
                    {selectedConv.nickname || selectedConv.guest_name || selectedConv.phone || `访客${selectedConv.id}`}
                  </p>
                  <p className="text-xs text-[#94a3b8]">
                    对话 #{selectedConv.id} · {selectedConv.message_count} 条消息 · {selectedConv.created_at?.split('.')[0]?.replace('T', ' ')}
                  </p>
                </div>
                {selectedConv.status !== 'closed' && (
                  <button
                    onClick={() => handleCloseConv(selectedConv.id)}
                    className="rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs text-[#ef4444] hover:border-[#ef4444] hover:bg-[#fef2f2] transition-all"
                  >
                    关闭对话
                  </button>
                )}
                {selectedConv.status === 'closed' && (
                  <span className="text-xs text-[#94a3b8] bg-[#f1f5f9] px-2.5 py-1 rounded-full">已关闭</span>
                )}
              </div>

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="text-center text-sm text-[#94a3b8]">加载中...</div>
                ) : messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%]">
                      {msg.image_url && (
                        <img src={msg.image_url} alt="" className="mb-1 max-w-[150px] rounded-lg border" />
                      )}
                      <div className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-[#8b5cf6] text-white rounded-br-sm'
                          : 'bg-[#f1f5f9] text-[#1e293b] rounded-bl-sm'
                      }`}>
                        {msg.content}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[10px] text-[#cbd5e1]">{msg.created_at?.split('.')[0]?.replace('T', ' ')}</span>
                        {msg.rating === 1 && <span className="text-[10px] text-[#10b981]">👍</span>}
                        {msg.rating === -1 && <span className="text-[10px] text-[#ef4444]">👎</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
