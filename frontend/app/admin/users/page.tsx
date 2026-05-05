'use client';

import { useState, useEffect, useRef } from 'react';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import VIPBadge from '@/components/ui/VIPBadge';
import Pagination from '@/components/ui/Pagination';

interface User {
  id: number;
  phone: string;
  nickname: string;
  avatar: string;
  vip: number;
  vip_expires_at: string;
  customer_level_id: number;
  customer_level_name: string;
  created_at: string;
}

interface CustomerLevel {
  id: number;
  name: string;
}

function isExpired(expiresAt: string) {
  if (!expiresAt) return true;
  return new Date(expiresAt) < new Date();
}

function formatExpires(expiresAt: string) {
  if (!expiresAt) return '永久';
  const d = new Date(expiresAt);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function AdminUsersPage() {
  // 数据
  const [users, setUsers] = useState<User[]>([]);
  const [levels, setLevels] = useState<CustomerLevel[]>([]);
  const [loading, setLoading] = useState(true);

  // 搜索 + 筛选
  const [search, setSearch] = useState('');
  const [filterVIP, setFilterVIP] = useState<'all'|'vip'|'non-vip'>('all');
  const [filterLevel, setFilterLevel] = useState(0);

  // 创建
  const [showCreate, setShowCreate] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newNick, setNewNick] = useState('');
  const [newLevel, setNewLevel] = useState(0);
  const [creating, setCreating] = useState(false);

  // 编辑详情弹窗
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [editNick, setEditNick] = useState('');
  const [editLevel, setEditLevel] = useState(0);
  const [editVIP, setEditVIP] = useState(false);
  const [editVIPDays, setEditVIPDays] = useState(30);
  const [savingDetail, setSavingDetail] = useState(false);

  // 导入
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 过滤后的用户
  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    if (q && !u.phone.includes(q) && !(u.nickname || '').toLowerCase().includes(q)) return false;
    if (filterVIP === 'vip' && (u.vip !== 1 || isExpired(u.vip_expires_at))) return false;
    if (filterVIP === 'non-vip' && (u.vip === 1 && !isExpired(u.vip_expires_at))) return false;
    if (filterLevel > 0 && u.customer_level_id !== filterLevel) return false;
    return true;
  });
  const pagedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  const fetchUsers = () => {
    setLoading(true);
    adminApi.getUsers().then((res) => {
      setUsers(res.users || []);
    }).catch(console.error).finally(() => setLoading(false));
  };

  const fetchLevels = () => {
    adminApi.getCustomerLevels().then(res => {
      setLevels(res.levels || []);
    }).catch(() => {});
  };

  useEffect(() => { fetchUsers(); fetchLevels(); }, []);

  // === 创建用户 ===
  const handleCreate = async () => {
    if (!newPhone || !newPwd) { showToast('请填写手机号和密码', 'error'); return; }
    setCreating(true);
    try {
      const res = await adminApi.createUser({ phone: newPhone, password: newPwd, nickname: newNick });
      if (newLevel > 0 && res.user) {
        await adminApi.updateUser(res.user.id, { customer_level_id: newLevel });
      }
      showToast('创建成功', 'success');
      setShowCreate(false);
      setNewPhone(''); setNewPwd(''); setNewNick(''); setNewLevel(0);
      fetchUsers();
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setCreating(false); }
  };

  // === 打开详情编辑 ===
  const openDetail = (u: User) => {
    setDetailUser(u);
    setEditNick(u.nickname || '');
    setEditLevel(u.customer_level_id || 0);
    setEditVIP(u.vip === 1 && !isExpired(u.vip_expires_at));
    setEditVIPDays(30);
  };

  // === 保存详情 ===
  const handleSaveDetail = async () => {
    if (!detailUser) return;
    setSavingDetail(true);
    try {
      const data: any = { nickname: editNick, customer_level_id: editLevel };
      if (editVIP) {
        const expires = new Date();
        expires.setDate(expires.getDate() + editVIPDays);
        data.vip = 1;
        data.vip_expires_at = expires.toISOString().split('T')[0];
      } else {
        data.vip = 0;
        data.vip_expires_at = '';
      }
      await adminApi.updateUser(detailUser.id, data);
      showToast('用户信息已更新', 'success');
      setDetailUser(null);
      fetchUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingDetail(false);
    }
  };

  const hasActiveFilter = search || filterVIP !== 'all' || filterLevel > 0;

  return (
    <>
    <div className="space-y-6">
      {/* 顶部工具栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[#1e293b]">用户管理</h1>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">+ 创建用户</button>
        </div>

        {/* 筛选控制栏 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 搜索框（胶囊形） */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg className="w-4 h-4 text-[#94a3b8] group-focus-within:text-[#8b5cf6] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="手机号 / 昵称"
              className="pl-9 pr-8 py-2 w-44 text-sm bg-white border border-[#e2e8f0] rounded-full outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all placeholder:text-[#94a3b8]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-[#94a3b8] hover:text-[#64748b] hover:bg-[#f1f5f9] transition-all">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* VIP 筛选 */}
          <div className="relative">
            <select
              value={filterVIP}
              onChange={e => setFilterVIP(e.target.value as any)}
              className={`appearance-none pl-3 pr-7 py-2 text-sm border rounded-full bg-white outline-none transition-all text-[#64748b] cursor-pointer ${filterVIP !== 'all' ? 'border-[#8b5cf6] text-[#8b5cf6] bg-[#f5f3ff]' : 'border-[#e2e8f0] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20'}`}
            >
              <option value="all">全部用户</option>
              <option value="vip">VIP用户</option>
              <option value="non-vip">非VIP</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg className="w-3.5 h-3.5 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          {/* 客户身份筛选 */}
          <div className="relative">
            <select
              value={filterLevel}
              onChange={e => setFilterLevel(Number(e.target.value))}
              className={`appearance-none pl-3 pr-7 py-2 text-sm border rounded-full bg-white outline-none transition-all cursor-pointer ${filterLevel > 0 ? 'border-[#8b5cf6] text-[#8b5cf6] bg-[#f5f3ff]' : 'border-[#e2e8f0] text-[#64748b] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20'}`}
            >
              <option value={0}>全部身份</option>
              {levels.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg className="w-3.5 h-3.5 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          {/* 分隔 */}
          <div className="h-6 w-px bg-[#e2e8f0]" />

          {/* 导入 */}
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImporting(true);
              try {
                const res = await adminApi.importUsers(file);
                showToast(res.message || `导入完成：${res.imported} 条`, 'success');
                fetchUsers();
              } catch (err: any) { showToast(err.message, 'error'); }
              finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {importing ? '导入中...' : '导入'}
          </button>
          <button onClick={async () => {
            try { await adminApi.exportUsers(); showToast('导出成功', 'success'); }
            catch (err: any) { showToast(err.message, 'error'); }
          }} className="btn btn-secondary btn-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            导出
          </button>

          {/* 计数 */}
          <span className="text-sm text-[#94a3b8] ml-1 whitespace-nowrap">
            {filteredUsers.length !== users.length ? `${filteredUsers.length} / ${users.length}` : users.length}
          </span>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-[#94a3b8]">{hasActiveFilter ? '未找到匹配用户' : '暂无用户'}</div>
        ) : (
          <>
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">ID</th>
                <th>手机号</th>
                <th>昵称</th>
                <th>VIP</th>
                <th>到期</th>
                <th>客户身份</th>
                <th>注册时间</th>
                <th className="w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map((u) => {
                const expired = u.vip === 1 && isExpired(u.vip_expires_at);
                return (
                <tr key={u.id} className="group">
                  <td className="text-xs font-mono text-[#94a3b8]">{u.id}</td>
                  <td className="font-medium text-[#1e293b]">{u.phone}</td>
                  <td className="text-[#64748b]">{u.nickname || '-'}</td>
                  <td>
                    {u.vip === 1 && !expired ? (
                      <VIPBadge />
                    ) : expired ? (
                      <span className="text-xs text-[#94a3b8]">已过期</span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetail(u); setEditVIP(true); }}
                        className="rounded border border-dashed border-[#e2e8f0] px-2 py-0.5 text-xs text-[#94a3b8] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all"
                      >
                        开通
                      </button>
                    )}
                  </td>
                  <td className="text-xs text-[#94a3b8]">
                    {u.vip === 1 && !expired ? formatExpires(u.vip_expires_at) : '-'}
                  </td>
                  <td>
                    {u.customer_level_name ? (
                      <span className="inline-flex items-center rounded-full bg-[#f5f3ff] px-2.5 py-0.5 text-xs font-medium text-[#8b5cf6]">
                        {u.customer_level_name}
                      </span>
                    ) : (
                      <span className="text-xs text-[#94a3b8]">-</span>
                    )}
                  </td>
                  <td className="text-xs text-[#94a3b8]">{u.created_at?.split(' ')[0]}</td>
                  <td>
                    <button
                      onClick={() => openDetail(u)}
                      className="rounded-lg border border-[#e2e8f0] px-2.5 py-1 text-xs text-[#64748b] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          <Pagination page={page} total={filteredUsers.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>
    </div>

    {/* 创建用户弹窗 */}
    {showCreate && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
        <div className="card w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-[#1e293b]">创建用户</h3>
          <div className="mt-4 space-y-3">
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="手机号 *" className="input text-sm" />
            <input value={newNick} onChange={e => setNewNick(e.target.value)} placeholder="昵称" className="input text-sm" />
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="密码 *" className="input text-sm" />
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">客户身份</label>
              <select value={newLevel} onChange={e => setNewLevel(Number(e.target.value))} className="select text-sm">
                <option value={0}>无</option>
                {levels.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 btn btn-primary btn-sm justify-center">
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* 用户详情弹窗 */}
    {detailUser && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailUser(null)}>
        <div className="card w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-[#1e293b]">用户详情</h3>
          <p className="mt-1 text-xs text-[#94a3b8]">ID: {detailUser.id} · {detailUser.phone}</p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">昵称</label>
              <input value={editNick} onChange={e => setEditNick(e.target.value)} className="input text-sm" placeholder="未设置" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">客户身份</label>
              <select value={editLevel} onChange={e => setEditLevel(Number(e.target.value))} className="select text-sm">
                <option value={0}>无（未分类）</option>
                {levels.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">VIP 会员</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditVIP(!editVIP)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editVIP ? 'bg-[#8b5cf6]' : 'bg-[#cbd5e1]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${editVIP ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-[#64748b]">{editVIP ? '已开通' : '未开通'}</span>
              </div>
              {editVIP && (
                <div className="mt-3">
                  <label className="mb-2 block text-xs font-medium text-[#64748b]">开通时长</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[7, 30, 90, 180, 365].map(d => (
                      <button key={d} onClick={() => setEditVIPDays(d)}
                        className={`rounded-lg py-2 text-xs font-medium border transition-all ${
                          editVIPDays === d ? 'border-[#8b5cf6] bg-[#f5f3ff] text-[#8b5cf6]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]'
                        }`}
                      >
                        {d}天
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[#94a3b8]">
                    到期：{(() => { const d = new Date(); d.setDate(d.getDate() + editVIPDays);
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-5">
            <button onClick={() => setDetailUser(null)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
            <button onClick={handleSaveDetail} disabled={savingDetail} className="flex-1 btn btn-primary btn-sm justify-center">
              {savingDetail ? '保存中...' : '保存修改'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}