'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminSidebar from '@/components/layout/AdminSidebar';
import ToastContainer from '@/components/ui/Toast';
import SettingsModal from '@/components/ui/SettingsModal';
import { authApi } from '@/lib/api';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  
  const [user, setUser] = useState<{ nickname: string; phone: string; role: string } | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('imai-admin-token');
    if (!token) {
      router.push('/admin-login');
      return;
    }
    // 验证管理员 token — 通过调用 admin 接口确认身份
    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      if (!r.ok) throw new Error('未授权');
      return r.json();
    }).then(() => {
      // 用 TextDecoder 正确解码 base64 中的中文
      const bytes = Uint8Array.from(atob(token.split('.')[1]), c => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      setUser({ nickname: payload.nickname || payload.username, phone: '', role: payload.role });
      setAuthed(true);
    }).catch(() => {
      localStorage.removeItem('imai-admin-token');
      router.push('/admin-login');
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#8b5cf6] border-t-transparent" />
          <p className="mt-3 text-sm text-[#94a3b8]">验证身份...</p>
        </div>
      </div>
    );
  }

  if (!authed) return null;

  return (
    <div className="flex">
      <AdminSidebar />
      <div className="admin-content flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#e2e8f0] bg-white px-6">
          <h1 className="text-lg font-semibold text-[#1e293b]">后台管理</h1>
          <div className="flex items-center gap-3">
            <Link href="/admin/settings" className="flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs text-[#64748b] hover:bg-[#f1f5f9] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              设置
            </Link>
            <span className="text-sm text-[#64748b]">{user?.nickname || user?.phone}</span>
            <button
              onClick={() => { localStorage.removeItem('imai-admin-token'); router.push('/admin-login'); }}
              className="rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs text-[#64748b] hover:bg-[#f1f5f9] transition-colors"
            >
              退出
            </button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
      <ToastContainer />
    </div>
  );
}
