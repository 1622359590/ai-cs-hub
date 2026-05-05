'use client';

import { useState, useEffect } from 'react';
import { showToast } from '@/components/ui/Toast';
import { adminApi } from '@/lib/api';
import Pagination from '@/components/ui/Pagination';

interface Admin {
  id: number;
  username: string;
  nickname: string;
  role: string;
  created_at: string;
}

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newNick, setNewNick] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchAdmins = () => {
    setLoading(true);
    adminApi.getAdmins().then(res => {
      setAdmins(res.admins || []);
    }).catch(() => showToast('获取管理员列表失败', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAdmins(); }, []);

  const pagedAdmins = admins.slice((page - 1) * pageSize, page * pageSize);

  const handleCreate = async () => {
    if (!newUsername || !newPwd) { showToast('请填写用户名和密码', 'error'); return; }
    setCreating(true);
    try {
      await adminApi.createAdmin({ username: newUsername, password: newPwd, nickname: newNick, role: newRole });
      showToast('管理员创建成功', 'success');
      setShowCreate(false);
      setNewUsername(''); setNewPwd(''); setNewNick('');
      fetchAdmins();
    } catch (err: any) { showToast(err.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteAdmin(id);
      showToast('已删除', 'success');
      setDeleteId(null);
      fetchAdmins();
    } catch (err: any) { showToast(err.message, 'error'); }
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[#1e293b]">管理员管理</h1>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">+ 创建管理员</button>
        </div>
        <span className="text-sm text-[#64748b]">共 {admins.length} 位管理员</span>
      </div>

      <div className="card">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
        ) : admins.length === 0 ? (
          <div className="py-12 text-center text-[#94a3b8]">暂无管理员</div>
        ) : (
          <>
          <table className="w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>昵称</th>
                <th>角色</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedAdmins.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs font-mono">{a.id}</td>
                  <td className="font-medium">{a.username}</td>
                  <td>{a.nickname || '-'}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      a.role === 'admin' ? 'text-[#8b5cf6]' : 'text-[#64748b]'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${a.role === 'admin' ? 'bg-[#8b5cf6]' : 'bg-[#94a3b8]'}`} />
                      {a.role === 'admin' ? '超级管理员' : '子管理员'}
                    </span>
                  </td>
                  <td className="text-xs text-[#94a3b8]">{a.created_at?.split(' ')[0]}</td>
                  <td>
                    {a.role !== 'admin' && (
                      <button onClick={() => setDeleteId(a.id)} className="rounded px-2 py-1 text-xs text-[#ef4444] hover:bg-[#fef2f2]">
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={admins.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>
    </div>

    {/* 创建弹窗 */}
    {showCreate && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
        <div className="card w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-[#1e293b]">创建管理员</h3>
          <div className="mt-4 space-y-3">
            <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="用户名 *" className="input text-sm" />
            <input value={newNick} onChange={e => setNewNick(e.target.value)} placeholder="昵称（可选）" className="input text-sm" />
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="密码 *" className="input text-sm" />
            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="select text-sm">
              <option value="editor">子管理员</option>
              <option value="admin">超级管理员</option>
            </select>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
              <button onClick={handleCreate} disabled={creating} className="flex-1 btn btn-primary btn-sm justify-center">{creating ? '创建中...' : '创建'}</button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* 删除确认 */}
    {deleteId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
        <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-[#1e293b]">确认删除</h3>
          <p className="mt-2 text-sm text-[#64748b]">确定要删除这个管理员账号吗？</p>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="btn btn-secondary btn-sm">取消</button>
            <button onClick={() => handleDelete(deleteId)} className="btn btn-danger btn-sm">确认删除</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
