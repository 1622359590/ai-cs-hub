'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import VIPBadge from '@/components/ui/VIPBadge';
import Pagination from '@/components/ui/Pagination';

interface User {
  id: number;
  phone: string;
  nickname: string;
  role: string;
  vip: number;
  vip_expires_at: string;
  created_at: string;
}

export default function AdminVIPPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [editUser, setEditUser] = useState<User | null>(null);
  const [vipDays, setVipDays] = useState(30);

  const fetchUsers = () => {
    setLoading(true);
    adminApi.getUsers().then(res => {
      setUsers(res.users || []);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  // 搜索过滤
  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.phone.includes(q) || (u.nickname || '').toLowerCase().includes(q);
  });
  const pagedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  const handleSetVIP = async (userId: number, days: number) => {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    const expiresStr = expires.toISOString().split('T')[0];

    try {
      await adminApi.setVIP(userId, { vip: 1, vip_expires_at: expiresStr });
      showToast(`已设置为 VIP（${days}天）`, 'success');
      setEditUser(null);
      fetchUsers();
      setVipDays(30);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveVIP = async (userId: number) => {
    try {
      await adminApi.setVIP(userId, { vip: 0, vip_expires_at: '' });
      showToast('已取消 VIP', 'success');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const isExpired = (expiresAt: string) => {
    if (!expiresAt) return true;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1e293b]">VIP 会员管理</h1>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索手机号/昵称"
            className="px-3 py-1.5 text-sm border border-[#e2e8f0] rounded-full outline-none focus:border-[#8b5cf6] w-48"
          />
          <span className="text-sm text-[#64748b]">{filteredUsers.length} / {users.length}</span>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-[#94a3b8]">暂无用户</div>
        ) : (
          <>
          <table className="w-full">
            <thead>
              <tr>
                <th>手机号</th>
                <th>昵称</th>
                <th>角色</th>
                <th>VIP</th>
                <th>到期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map((u) => {
                const expired = u.vip === 1 && isExpired(u.vip_expires_at);
                return (
                  <tr key={u.id}>
                    <td className="font-medium">{u.phone}</td>
                    <td>{u.nickname || '-'}</td>
                    <td>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        u.role === 'admin' ? 'text-[#8b5cf6]' : 'text-[#64748b]'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.role === 'admin' ? 'bg-[#8b5cf6]' : 'bg-[#94a3b8]'}`} />
                        {u.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </td>
                    <td>
                      {u.vip === 1 && !expired ? (
                        <VIPBadge />
                      ) : expired ? (
                        <span className="text-xs text-[#94a3b8]">已过期</span>
                      ) : (
                        <span className="text-xs text-[#94a3b8]">-</span>
                      )}
                    </td>
                    <td className="text-xs text-[#94a3b8]">{u.vip_expires_at || '-'}</td>
                    <td>
                      {u.role !== 'admin' && (
                        <div className="flex gap-2">
                          {u.vip === 1 ? (
                            <button onClick={() => handleRemoveVIP(u.id)} className="rounded px-2 py-1 text-xs text-[#ef4444] hover:bg-[#fef2f2]">
                              取消VIP
                            </button>
                          ) : (
                            <button onClick={() => setEditUser(u)} className="rounded px-2 py-1 text-xs text-[#8b5cf6] hover:bg-[#f5f3ff]">
                              设为VIP
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} total={filteredUsers.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {/* 设置VIP弹窗 */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditUser(null)}>
          <div className="card w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#1e293b]">设置 VIP</h3>
            <p className="mt-1 text-sm text-[#64748b]">用户：{editUser.phone}</p>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#64748b]">VIP 时长</label>
              <div className="grid grid-cols-3 gap-2">
                {[7, 30, 90, 180, 365].map(d => (
                  <button key={d} onClick={() => setVipDays(d)}
                    className={`rounded-lg py-2 text-sm font-medium border transition-all ${
                      vipDays === d ? 'border-[#8b5cf6] bg-[#f5f3ff] text-[#8b5cf6]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]'
                    }`}>
                    {d}天
                  </button>
                ))}
              </div>
              <button onClick={() => handleSetVIP(editUser.id, vipDays)} className="btn btn-primary w-full justify-center mt-4">
                确认设置
              </button>
            </div>
            <button onClick={() => setEditUser(null)} className="mt-3 w-full text-center text-xs text-[#94a3b8] hover:text-[#64748b]">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
