'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { aiApi, authApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string;
  rating?: number;
  created_at?: string;
}

export default function SupportPage() {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 只在 AI 回复时滚聊天容器底部，用户发消息不滚
  const shouldScrollRef = useRef(false);
  useEffect(() => {
    if (shouldScrollRef.current && chatContainerRef.current) {
      const container = chatContainerRef.current;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      shouldScrollRef.current = false;
    }
  }, [messages]);

  // 初始化：显示欢迎消息（不创建对话，发消息时才创建）
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: '嗨～我是 imai小助手 ✨\n\n养号、获客、短视频运营的问题都可以问我～解决不了我帮你转人工 💪',
    }]);
  }, []);

  // 上传图片
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('imai-token');
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
        setImageUrl(data.url);
        showToast('图片已上传', 'success');
      } else {
        showToast(data.error || '上传失败', 'error');
      }
    } catch (err: any) {
      showToast('上传失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 拖拽上传
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const token = localStorage.getItem('imai-token');
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
        setImageUrl(data.url);
        showToast('图片已上传', 'success');
      } else {
        showToast(data.error || '上传失败', 'error');
      }
    } catch {
      showToast('上传失败', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 发送消息
  const handleSend = async () => {
    const text = input.trim();
    if (!text && !imageUrl) return;
    if (sending) return;

    // 懒创建对话：第一条消息时才创建
    let convId = conversationId;
    if (!convId) {
      try {
        const token = localStorage.getItem('imai-token');
        let guestName = '';
        if (token) {
          try { const me = await authApi.getMe(); guestName = me.user?.nickname || me.user?.phone || ''; } catch {}
        }
        const res = await aiApi.createConversation(guestName);
        convId = res.conversation.id;
        setConversationId(convId);
      } catch (err: any) {
        showToast('创建对话失败: ' + err.message, 'error');
        return;
      }
    }

    const userMsg: Message = { role: 'user', content: text, image_url: imageUrl };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setImageUrl('');
    setSending(true);
    // 用户发送时也滚到底部
    setTimeout(() => {
      chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);

    try {
      const res = await aiApi.sendMessage(convId!, text, imageUrl);
      shouldScrollRef.current = true;

      // 打字机效果：先加空消息，再逐字填充
      const msgIndex = messages.length + 1; // +1 因为 userMsg 已经加了
      setMessages(prev => [...prev, { id: res.message_id, role: 'assistant', content: '' }]);

      const fullText = res.reply;
      let current = 0;
      const chunkSize = 3; // 每次显示的字符数
      const typeInterval = setInterval(() => {
        current = Math.min(current + chunkSize, fullText.length);
        const partial = fullText.slice(0, current);
        setMessages(prev => prev.map((msg, i) =>
          i === prev.length - 1 && msg.role === 'assistant' ? { ...msg, content: partial } : msg
        ));
        if (current >= fullText.length) {
          clearInterval(typeInterval);
          setSending(false);
          inputRef.current?.focus();
        }
      }, 30);

      // 打字期间保持滚动
      const scrollInterval = setInterval(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 200);
      setTimeout(() => clearInterval(scrollInterval), fullText.length * 10 + 500);

    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ 抱歉，AI 回复失败：' + (err.message || '未知错误') + '\n\n你可以稍后重试，或直接提交人工工单。',
      }]);
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // 评分
  const handleRate = async (messageIndex: number, messageId: number, rating: number) => {
    try {
      await aiApi.rateMessage(messageId, rating);
      setMessages(prev => prev.map((msg, i) =>
        i === messageIndex ? { ...msg, rating } : msg
      ));
      showToast(rating === 1 ? '感谢你的反馈！' : '已记录，会持续改进', 'success');
    } catch {}
  };

  // 开始新对话
  const handleNewConversation = async () => {
    // 先关闭当前对话
    if (conversationId) {
      try { await aiApi.endConversation(conversationId); } catch {}
    }
    setConversationId(null);
    setMessages([{ role: 'assistant', content: '嗨～我是 imai小助手 ✨\n\n养号、获客、短视频运营的问题都可以问我～解决不了我帮你转人工 💪' }]);
    inputRef.current?.focus();
  };

  // 转人工
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTitle, setTransferTitle] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const openTransferModal = () => {
    if (!conversationId) return;
    const token = localStorage.getItem('imai-token');
    if (!token) {
      showToast('请先登录后再转人工', 'error');
      router.push('/login');
      return;
    }
    // 从对话中提取第一个用户问题作为标题
    const userMsgs = messages.filter(m => m.role === 'user');
    const firstQuestion = userMsgs[0]?.content || '';
    setTransferTitle(firstQuestion.slice(0, 50) || '需要人工协助');
    setShowTransferModal(true);
  };

  const handleTransferConfirm = async () => {
    if (!conversationId || !transferTitle.trim()) return;
    setTransferLoading(true);
    try {
      const res = await aiApi.transferToHuman(conversationId, { title: transferTitle.trim() });
      showToast('已转人工客服', 'success');
      setShowTransferModal(false);
      router.push(`/ticket/${res.ticket.id}`);
    } catch (err: any) {
      showToast(err.message || '转人工失败', 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  // 加载历史对话
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await aiApi.getConversations();
      setHistoryList(res.conversations || []);
    } catch {}
    setLoadingHistory(false);
  };

  // 切换到历史对话
  const switchConversation = async (convId: number) => {
    setShowHistory(false);
    setConversationId(convId);
    try {
      const res = await aiApi.getMessages(convId);
      setMessages(res.messages || []);
      shouldScrollRef.current = true;
    } catch {
      showToast('加载对话失败', 'error');
    }
  };

  // 新建对话
  const startNewConversation = async () => {
    setShowHistory(false);
    try {
      const token = localStorage.getItem('imai-token');
      let guestName = '';
      if (token) {
        try { const me = await authApi.getMe(); guestName = me.user?.nickname || me.user?.phone || ''; } catch {}
      }
      const res = await aiApi.createConversation(guestName);
      setConversationId(res.conversation.id);
      setMessages([{ role: 'assistant', content: '嗨～我是 imai小助手 ✨\n\n养号、获客、短视频运营的问题都可以问我～解决不了我帮你转人工 💪' }]);
    } catch (err: any) {
      showToast('创建对话失败', 'error');
    }
  };

  // 快捷问题
  const quickQuestions = [
    'AI获客怎么配置？',
    '抖音养号有什么技巧？',
    '设备绑定失败怎么办？',
    '24小时任务怎么启动？',
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#f8fafc]">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {/* 页面标题 */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] text-white shadow-lg shadow-[#8b5cf6]/30">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="10" y1="24" x2="14" y2="24"/></svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#1e293b]">imai小助手</h1>
                <p className="text-sm text-[#64748b]">有问题先问我 · 解决不了再找人工</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowHistory(true); loadHistory(); }}
                className="flex items-center gap-1.5 rounded-full border border-[#e2e8f0] px-3 py-2 text-sm text-[#64748b] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                历史
              </button>
              <button
                onClick={openTransferModal}
                className="flex items-center gap-1.5 rounded-full border border-[#8b5cf6] px-4 py-2 text-sm font-medium text-[#8b5cf6] hover:bg-[#8b5cf6] hover:text-white transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
                转人工
              </button>
              {conversationId && (
                <button
                  onClick={handleNewConversation}
                  className="flex items-center gap-1.5 rounded-full border border-[#e2e8f0] px-3 py-2 text-sm text-[#94a3b8] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                  新对话
                </button>
              )}
            </div>
          </div>

          {/* 对话区域 */}
          <div className="card flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
            {/* 消息列表 */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                    {/* 图片 */}
                    {msg.image_url && (
                      <div className="mb-1">
                        <img src={msg.image_url} alt="上传的图片" className="max-w-[200px] rounded-lg border border-[#e2e8f0]" />
                      </div>
                    )}
                    {/* 消息气泡 */}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#8b5cf6] text-white rounded-br-md whitespace-pre-wrap'
                        : 'bg-white border border-[#e2e8f0] text-[#1e293b] rounded-bl-md chat-markdown'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                    {/* 评分按钮（仅 AI 消息） */}
                    {msg.role === 'assistant' && msg.id && (
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          onClick={() => handleRate(i, msg.id!, msg.rating === 1 ? 0 : 1)}
                          className={`p-1 rounded transition-colors ${msg.rating === 1 ? 'text-[#10b981]' : 'text-[#cbd5e1] hover:text-[#10b981]'}`}
                          title="有帮助"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={msg.rating === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleRate(i, msg.id!, msg.rating === -1 ? 0 : -1)}
                          className={`p-1 rounded transition-colors ${msg.rating === -1 ? 'text-[#ef4444]' : 'text-[#cbd5e1] hover:text-[#ef4444]'}`}
                          title="没帮助"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={msg.rating === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"/>
                          </svg>
                        </button>
                        {msg.rating !== undefined && msg.rating !== 0 && (
                          <span className="text-[10px] text-[#94a3b8] ml-1">
                            {msg.rating === 1 ? '已标记有帮助' : '已标记没帮助'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* AI 正在输入 */}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-[#e2e8f0] bg-white px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8b5cf6]" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8b5cf6]" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#8b5cf6]" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 快捷问题（仅初始状态） */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-2">
                  {quickQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      className="rounded-full border border-[#e2e8f0] px-3 py-1.5 text-xs text-[#64748b] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 输入区域 - 支持拖拽 */}
            <div className={`border-t p-4 transition-colors ${dragOver ? 'border-[#8b5cf6] bg-[#f5f3ff]' : 'border-[#e2e8f0]'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {/* 已上传图片预览 */}
              {imageUrl && (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#8b5cf6]/30 bg-[#f5f3ff] p-2">
                  <img src={imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#8b5cf6]">已上传图片</p>
                    <p className="text-[10px] text-[#94a3b8]">发送后 AI 会分析这张图片</p>
                  </div>
                  <button onClick={() => setImageUrl('')} className="flex-shrink-0 p-1 rounded hover:bg-white text-[#94a3b8] hover:text-[#ef4444]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                {/* 上传按钮 */}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-shrink-0 rounded-lg p-2 text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#8b5cf6] transition-colors"
                  title="上传图片（或拖拽到输入框）"
                >
                  {uploading ? (
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="30 70"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                </button>

                {/* 输入框 */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
                  }}
                  placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
                  className="input flex-1 resize-none text-sm"
                  rows={1}
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                />

                {/* 发送按钮 */}
                <button
                  onClick={handleSend}
                  disabled={sending || (!input.trim() && !imageUrl)}
                  className="flex-shrink-0 rounded-lg bg-[#8b5cf6] p-2 text-white hover:bg-[#7c3aed] disabled:opacity-40 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-[10px] text-[#94a3b8] text-center">
                AI 回答仅供参考，如需人工帮助请点击「转人工」
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* 历史对话侧边栏 */}
      {showHistory && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowHistory(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#1e293b]">历史对话</h3>
              <div className="flex items-center gap-2">
                <button onClick={startNewConversation}
                  className="rounded-lg bg-[#8b5cf6] px-2.5 py-1 text-xs text-white hover:bg-[#7c3aed] transition-colors">
                  + 新对话
                </button>
                <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-[#f1f5f9] text-[#94a3b8]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingHistory ? (
                <div className="p-4 text-center text-sm text-[#94a3b8]">加载中...</div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-[#94a3b8]">暂无历史对话</p>
                </div>
              ) : (
                <div className="divide-y divide-[#e2e8f0]">
                  {historyList.map(conv => (
                    <button key={conv.id}
                      onClick={() => switchConversation(conv.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-[#f8fafc] transition-colors ${conversationId === conv.id ? 'bg-[#f5f3ff]' : ''}`}>
                      <p className="text-sm text-[#1e293b] truncate">{conv.first_message || `对话 #${conv.id}`}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[#94a3b8]">
                        <span>{conv.message_count} 条消息</span>
                        <span>·</span>
                        <span>{conv.updated_at?.split(' ')[0]}</span>
                        {conv.status === 'transferred' && (
                          <span className="ml-auto text-[#d97706]">已转人工</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 转人工确认弹窗 */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTransferModal(false)}>
          <div className="card w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#1e293b]">转人工客服</h3>
            <p className="mt-1 text-sm text-[#64748b]">确认后将为你创建工单，工程师会尽快处理</p>

            {/* 工单标题 */}
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">工单标题</label>
              <input
                value={transferTitle}
                onChange={e => setTransferTitle(e.target.value)}
                className="input"
                placeholder="描述你的问题"
              />
              <p className="mt-1 text-xs text-[#94a3b8]">已根据你的对话自动生成，可修改</p>
            </div>

            {/* 对话预览 */}
            <div className="mt-3 rounded-lg border border-[#e2e8f0] p-3 max-h-32 overflow-y-auto">
              <p className="text-xs font-medium text-[#64748b] mb-2">对话记录将一同提交</p>
              {messages.filter(m => m.content).slice(-4).map((msg, i) => (
                <p key={i} className="text-xs text-[#64748b] truncate">
                  <span className={msg.role === 'user' ? 'text-[#8b5cf6]' : 'text-[#10b981]'}>
                    {msg.role === 'user' ? '你' : 'AI'}：
                  </span>
                  {msg.content.slice(0, 60)}{msg.content.length > 60 ? '...' : ''}
                </p>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <button onClick={() => setShowTransferModal(false)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
              <button onClick={handleTransferConfirm} disabled={transferLoading || !transferTitle.trim()}
                className="flex-1 btn btn-primary btn-sm justify-center">
                {transferLoading ? '提交中...' : '确认转人工'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
