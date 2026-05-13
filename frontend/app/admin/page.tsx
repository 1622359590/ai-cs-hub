'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ tutorials: 0, published: 0, faqs: 0, users: 0, todayViews: 0, tickets: 0, ticketsPending: 0, ticketsProcessing: 0, ticketsResolved: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getStats().then(res => {
      setStats(res.stats);
    }).catch(() => showToast('获取统计数据失败', 'error')).finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: '已发布教程', value: stats.published, icon: '📖', color: '#8b5cf6', gradient: 'from-[#8b5cf6]/10 to-[#a855f7]/5' },
    { label: '注册用户', value: stats.users, icon: '👥', color: '#10b981', gradient: 'from-[#10b981]/10 to-[#059669]/5' },
    { label: 'FAQ 条目', value: stats.faqs, icon: '❓', color: '#f59e0b', gradient: 'from-[#f59e0b]/10 to-[#d97706]/5' },
    { label: '今日浏览', value: stats.todayViews, icon: '👁️', color: '#3b82f6', gradient: 'from-[#3b82f6]/10 to-[#2563eb]/5' },
  ];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="page-header">
        <h1>仪表盘</h1>
        <p>系统运行概览</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`rounded-full bg-gradient-to-br ${card.gradient} px-2 py-0.5`}>
                <span className="text-[10px] font-semibold" style={{ color: card.color }}>实时</span>
              </div>
            </div>
            {loading ? (
              <div className="skeleton h-8 w-16 mb-1" />
            ) : (
              <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* 工单概览 */}
      {stats.tickets > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">工单概览</h2>
            <Link href="/admin/tickets" className="text-xs text-[var(--accent)] hover:underline">查看全部 →</Link>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--border)] p-4 text-center bg-gradient-to-b from-white to-[var(--bg-secondary)]">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.tickets}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">全部工单</p>
            </div>
            <div className="rounded-xl border border-amber-200 p-4 text-center bg-gradient-to-b from-amber-50/50 to-white">
              <p className="text-2xl font-bold text-amber-600">{stats.ticketsPending}</p>
              <p className="text-xs text-amber-500 mt-1">待处理</p>
            </div>
            <div className="rounded-xl border border-blue-200 p-4 text-center bg-gradient-to-b from-blue-50/50 to-white">
              <p className="text-2xl font-bold text-blue-600">{stats.ticketsProcessing}</p>
              <p className="text-xs text-blue-500 mt-1">处理中</p>
            </div>
            <div className="rounded-xl border border-emerald-200 p-4 text-center bg-gradient-to-b from-emerald-50/50 to-white">
              <p className="text-2xl font-bold text-emerald-600">{stats.ticketsResolved}</p>
              <p className="text-xs text-emerald-500 mt-1">已解决</p>
            </div>
          </div>
        </div>
      )}

      {/* 快速操作 */}
      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">快速操作</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/tutorials/new" className="btn btn-primary btn-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建教程
          </Link>
          <Link href="/admin/faq" className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建 FAQ
          </Link>
          <Link href="/admin/tickets" className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5v2"/><path d="M15 11v2"/><path d="M15 17v2"/><path d="M5 5h14a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 000-4V7a2 2 0 012-2z"/></svg>
            处理工单
          </Link>
        </div>
      </div>

      {/* 最新教程 */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">最新教程</h2>
          <Link href="/admin/tutorials" className="text-xs text-[var(--accent)] hover:underline">查看全部 →</Link>
        </div>
        <TutorialList />
      </div>
    </div>
  );
}

function TutorialList() {
  const [tutorials, setTutorials] = useState<any[]>([]);

  useEffect(() => {
    adminApi.getTutorials().then(res => {
      setTutorials((res.tutorials || []).slice(0, 5));
    }).catch(console.error);
  }, []);

  if (tutorials.length === 0) {
    return <div className="empty-state py-12"><p className="empty-state-text">暂无教程</p></div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-secondary)]">标题</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-secondary)]">分类</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-secondary)]">状态</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-secondary)]">阅读</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-secondary)]">时间</th>
          </tr>
        </thead>
        <tbody>
          {tutorials.map((t: any) => (
            <tr key={t.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
              <td className="px-5 py-3 text-sm font-medium text-[var(--text-primary)] max-w-[300px] truncate">{t.title}</td>
              <td className="px-5 py-3"><span className="tag">{t.category}</span></td>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  t.status === 'published' ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  <span className={`status-dot ${t.status === 'published' ? 'status-dot-success' : 'status-dot-warning'}`} />
                  {t.status === 'published' ? '已发布' : '草稿'}
                </span>
              </td>
              <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{t.views}</td>
              <td className="px-5 py-3 text-sm text-[var(--text-muted)]">{t.created_at?.split(' ')[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
