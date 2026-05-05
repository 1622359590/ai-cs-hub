'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

interface Ticket {
  id: number;
  title: string;
  description: string;
  name: string;
  contact: string;
  type: string;
  group_name: string;
  attachments: string;
  status: string;
  reply: string;
  user_id: number;
  nickname: string;
  phone: string;
  processor_name: string;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待处理', color: 'text-[#d97706]', bg: 'bg-[#fef3c7]' },
  processing: { label: '处理中', color: 'text-[#2563eb]', bg: 'bg-[#dbeafe]' },
  resolved: { label: '已解决', color: 'text-[#059669]', bg: 'bg-[#ecfdf5]' },
};

const typeLabels: Record<string, string> = {
  bug: '问题反馈',
  feature: '功能建议',
  consult: '咨询',
  other: '其他',
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchTickets = (status?: string) => {
    setLoading(true);
    adminApi.getTickets(status || undefined)
      .then(res => setTickets(res.tickets || []))
      .catch(() => showToast('获取工单失败', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTickets(filterStatus); setPage(1); }, [filterStatus]);

  // 分页
  const pagedTickets = tickets.slice((page - 1) * pageSize, page * pageSize);

  const openDetail = (t: Ticket) => {
    setDetailTicket(t);
    setEditStatus(t.status);
    setReplyText(t.reply || '');
  };

  const handleSave = async () => {
    if (!detailTicket) return;
    setSaving(true);
    try {
      const payload: any = {};
      if (editStatus !== detailTicket.status) payload.status = editStatus;
      if (replyText !== (detailTicket.reply || '')) payload.reply = replyText;
      if (Object.keys(payload).length === 0) {
        showToast('没有需要保存的修改', 'error');
        setSaving(false);
        return;
      }
      const res = await adminApi.updateTicket(detailTicket.id, payload);
      showToast('保存成功', 'success');
      // 用服务端返回的完整数据更新列表（包含处理人）
      const updated = res.ticket;
      if (updated) {
        setTickets(prev => prev.map(t => t.id === detailTicket.id ? { ...t, ...updated } : t));
      } else {
        setTickets(prev => prev.map(t => t.id === detailTicket.id ? { ...t, ...payload } : t));
      }
      setDetailTicket(null);
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const parseAttachments = (raw: string) => {
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  };

  const handleExport = () => {
    const typeLabelsExport: Record<string, string> = { bug: '问题反馈', feature: '功能建议', consult: '咨询', other: '其他' };
    const statusLabelsExport: Record<string, string> = { pending: '待处理', processing: '处理中', resolved: '已解决' };
    const header = ['工单ID', '标题', '详细描述', '类型', '状态', '提交人', '联系方式', '售后群名', '管理员回复', '处理人', '提交时间', '更新时间'];
    const rows = tickets.map(t => [
      t.id, t.title, (t.description || '').replace(/[\n\r]/g, ' '),
      typeLabelsExport[t.type] || t.type, statusLabelsExport[t.status] || t.status,
      t.nickname || t.phone || `用户${t.user_id}`, t.contact || t.phone || '',
      t.group_name || '', (t.reply || '').replace(/[\n\r]/g, ' '),
      t.processor_name || '', t.created_at || '', t.updated_at || '',
    ]);
    const csvContent = [header, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工单导出_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${tickets.length} 条工单`, 'success');
  };

  return (
    <>
    <div className="space-y-6">
      {/* 顶部工具栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-[#1e293b]">工单管理</h1>
        <div className="flex items-center gap-2">
          {[
            { value: '', label: '全部' },
            { value: 'pending', label: '待处理' },
            { value: 'processing', label: '处理中' },
            { value: 'resolved', label: '已解决' },
          ].map(opt => (
            <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                filterStatus === opt.value ? 'border-[#8b5cf6] bg-[#f5f3ff] text-[#8b5cf6]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]'
              }`}>{opt.label}</button>
          ))}
          <div className="h-6 w-px bg-[#e2e8f0] mx-1" />
          <button onClick={handleExport} disabled={tickets.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-[#e2e8f0] px-3 py-1.5 text-xs font-medium text-[#64748b] hover:border-[#10b981] hover:text-[#10b981] transition-all disabled:opacity-40">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            导出
          </button>
          <span className="text-sm text-[#94a3b8] ml-1">{tickets.length} 条</span>
        </div>
      </div>

      {/* 工单列表 */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="py-12 text-center text-[#94a3b8]">暂无工单</div>
        ) : (
          <>
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">ID</th>
                <th>标题</th>
                <th>类型</th>
                <th>提交人</th>
                <th>状态</th>
                <th>处理人</th>
                <th>时间</th>
                <th className="w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedTickets.map(t => {
                const sc = statusConfig[t.status] || statusConfig.pending;
                return (
                <tr key={t.id} className="group">
                  <td className="text-xs font-mono text-[#94a3b8]">{t.id}</td>
                  <td className="max-w-[200px] truncate font-medium text-[#1e293b]">{t.title}</td>
                  <td><span className="tag">{typeLabels[t.type] || t.type}</span></td>
                  <td className="text-[#64748b]">{t.nickname || t.phone || `用户${t.user_id}`}</td>
                  <td>
                    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                  </td>
                  <td className="text-[#64748b] text-xs">{t.processor_name || '-'}</td>
                  <td className="text-xs text-[#94a3b8]">{t.created_at?.split('.')[0]?.replace('T', ' ') || t.created_at}</td>
                  <td>
                    <button onClick={() => openDetail(t)}
                      className="rounded-lg border border-[#e2e8f0] px-2.5 py-1 text-xs text-[#64748b] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all">处理</button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          <Pagination page={page} total={tickets.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>
    </div>

    {/* 工单详情弹窗 */}
    {detailTicket && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailTicket(null)}>
        <div className="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* 头部 */}
          <div className="flex items-start justify-between">
            <p className="text-xs text-[#94a3b8]">
              工单 #{detailTicket.id} · {typeLabels[detailTicket.type] || detailTicket.type} · {detailTicket.created_at?.split('.')[0]?.replace('T', ' ')}
            </p>
            <button onClick={() => setDetailTicket(null)} className="p-1 rounded hover:bg-[#f1f5f9] text-[#94a3b8]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* 工单标题 */}
          <div className="mt-3 rounded-lg border border-[#e2e8f0] p-3">
            <p className="text-xs font-medium text-[#64748b]">工单标题</p>
            <p className="mt-1 text-sm font-semibold text-[#1e293b]">{detailTicket.title}</p>
          </div>

          {/* 详细描述 */}
          <div className="mt-3 rounded-lg border border-[#e2e8f0] p-3">
            <p className="text-xs font-medium text-[#64748b]">详细描述</p>
            <p className="mt-1 text-sm text-[#1e293b] whitespace-pre-wrap">{detailTicket.description || '未填写描述'}</p>
          </div>

          {/* 提交人信息 */}
          <div className="mt-3 rounded-lg border border-[#e2e8f0] p-3">
            <p className="text-xs font-medium text-[#64748b]">提交人</p>
            <p className="mt-1 text-sm text-[#1e293b]">
              {detailTicket.nickname || '未填写'} · {detailTicket.phone || '未填写'}
              {detailTicket.contact && detailTicket.contact !== detailTicket.phone && (
                <span className="text-[#94a3b8]"> · 联系方式: {detailTicket.contact}</span>
              )}
            </p>
          </div>

          {/* 售后群名 */}
          {detailTicket.group_name && (
            <div className="mt-3 rounded-lg border border-[#8b5cf6]/20 bg-[#f5f3ff] p-3">
              <p className="text-xs font-medium text-[#8b5cf6]">售后群名</p>
              <p className="mt-1 text-sm font-semibold text-[#1e293b]">{detailTicket.group_name}</p>
            </div>
          )}

          {/* 附件 */}
          <div className="mt-3 rounded-lg border border-[#e2e8f0] p-3">
            <p className="text-xs font-medium text-[#64748b] mb-2">附件</p>
            {parseAttachments(detailTicket.attachments).length > 0 ? (
              <div className="space-y-1">
                {parseAttachments(detailTicket.attachments).map((att: any, i: number) => (
                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[#8b5cf6] hover:underline">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    {att.filename || '附件'}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#94a3b8]">暂无附件</p>
            )}
          </div>

          {/* 处理人 */}
          {detailTicket.processor_name && (
            <div className="mt-3 rounded-lg border border-[#e2e8f0] p-3">
              <p className="text-xs font-medium text-[#64748b]">处理人</p>
              <p className="mt-1 text-sm text-[#1e293b]">{detailTicket.processor_name}</p>
            </div>
          )}

          {/* 状态选择 */}
          <div className="mt-4">
            <p className="text-xs font-medium text-[#64748b] mb-2">工单状态</p>
            <div className="flex gap-2">
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button key={key} onClick={() => setEditStatus(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                    editStatus === key ? `${cfg.bg} ${cfg.color} border-transparent` : 'border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]'
                  }`}>{cfg.label}</button>
              ))}
            </div>
          </div>

          {/* 管理员回复 */}
          <div className="mt-4">
            <p className="text-xs font-medium text-[#64748b] mb-2">管理员回复</p>
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="输入回复内容，用户可在工单详情中查看..." className="input text-sm" rows={4} />
          </div>

          {/* 保存按钮 */}
          <div className="flex gap-2 pt-4">
            <button onClick={() => setDetailTicket(null)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 btn btn-primary btn-sm justify-center">
              {saving ? '保存中...' : '保存修改'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
