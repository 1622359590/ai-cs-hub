'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminSidebar from '@/components/layout/AdminSidebar';
import ToastContainer from '@/components/ui/Toast';
import { authApi } from '@/lib/api';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<{ nickname: string; phone: string; role: string } | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('imai-admin-token');
    if (!token) {
      router.push('/admin-login');
      return;
    }
    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      if (!r.ok) throw new Error('未授权');
      return r.json();
    }).then(() => {
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
      <div className="flex h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">验证身份...</p>
        </div>
      </div>
    );
  }

  if (!authed) return null;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="admin-content flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-white/80 backdrop-blur-xl px-6">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
            后台管理
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] text-[9px] font-bold text-white">
                {(user?.nickname || '?')[0]}
              </div>
              <span className="text-xs font-medium text-[var(--text-primary)]">{user?.nickname}</span>
              {user?.role === 'admin' && (
                <span className="rounded-full bg-[var(--accent-glow)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">管理员</span>
              )}
            </div>
            <button
              onClick={() => { localStorage.removeItem('imai-admin-token'); router.push('/admin-login'); }}
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
              title="退出登录"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
      <ToastContainer />
    </div>
  );
}
