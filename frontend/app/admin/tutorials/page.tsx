'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

const categories = ['全部', '使用入门', 'AI获客', 'AI销售', '产品功能', '养号攻略', '常见问题', '其他'];
const statuses = ['全部', 'published', 'draft'];

interface Tutorial {
  id: number;
  title: string;
  category: string;
  status: string;
  views: number;
  vip_only: number;
  created_at: string;
}

export default function AdminTutorialsPage() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchTutorials = () => {
    setLoading(true);
    const params: { category?: string; status?: string } = {};
    if (category !== '全部') params.category = category;
    if (status !== '全部') params.status = status;

    adminApi.getTutorials(params).then(res => {
      setTutorials(res.tutorials || []);
    }).catch(() => showToast('获取教程失败', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchTutorials(); setPage(1); }, [category, status]);

  const pagedTutorials = tutorials.slice((page - 1) * pageSize, page * pageSize);

  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteTutorial(id);
      showToast('删除成功', 'success');
      setDeleteId(null);
      fetchTutorials();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#1e293b]">教程管理</h1>
          <Link href="/admin/tutorials/new" className="btn btn-primary btn-sm">+ 新建教程</Link>
        </div>

        {/* 筛选 */}
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  category === cat ? 'bg-[#8b5cf6] text-white' : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                }`}>{cat}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {statuses.map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  status === s ? 'bg-[#8b5cf6] text-white' : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                }`}>{s === '全部' ? '全部' : s === 'published' ? '已发布' : '草稿'}</button>
            ))}
          </div>
        </div>

        {/* 表格 */}
        {loading ? (
          <div className="mt-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-[#f1f5f9]" />)}
          </div>
        ) : tutorials.length === 0 ? (
          <div className="mt-8 py-12 text-center text-[#94a3b8]">暂无教程</div>
        ) : (
          <>
          <table className="mt-6 w-full">
            <thead>
              <tr>
                <th>标题</th>
                <th>分类</th>
                <th>状态</th>
                <th>VIP</th>
                <th>阅读</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedTutorials.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium max-w-[300px] truncate">{t.title}</td>
                  <td><span className="tag">{t.category}</span></td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      t.status === 'published' ? 'text-[#10b981]' : 'text-[#f59e0b]'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${t.status === 'published' ? 'bg-[#10b981]' : 'bg-[#f59e0b]'}`} />
                      {t.status === 'published' ? '已发布' : '草稿'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const newVal = t.vip_only === 1 ? 0 : 1;
                        try {
                          await adminApi.updateTutorial(t.id, { vip_only: newVal === 1 });
                          showToast(newVal === 1 ? '🔒 已设为 VIP 专属' : '已取消 VIP', 'success');
                          fetchTutorials();
                        } catch (err: any) { showToast(err.message, 'error'); }
                      }}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                        t.vip_only === 1
                          ? 'bg-[#fef3c7] text-[#d97706] border-[#f59e0b]/30 shadow-sm'
                          : 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0] hover:border-[#cbd5e1]'
                      }`}
                    >
                      <svg className={`w-3 h-3 ${t.vip_only === 1 ? 'text-[#d97706]' : 'text-[#cbd5e1]'}`} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      {t.vip_only === 1 ? 'VIP' : '普通'}
                    </button>
                  </td>
                  <td>{t.views}</td>
                  <td className="text-[#94a3b8] text-xs">{t.created_at?.split(' ')[0]}</td>
                  <td>
                    <div className="flex gap-2">
                      <Link href={`/admin/tutorials/${t.id}`} className="rounded px-2 py-1 text-xs text-[#8b5cf6] hover:bg-[#8b5cf6]/5 transition-colors">
                        编辑
                      </Link>
                      {t.status === 'published' && (
                        <button
                          onClick={async () => {
                            try {
                              await adminApi.updateTutorial(t.id, { status: 'draft' });
                              showToast('已撤回为草稿', 'success');
                              fetchTutorials();
                            } catch (err: any) {
                              showToast(err.message, 'error');
                            }
                          }}
                          className="rounded px-2 py-1 text-xs text-[#f59e0b] hover:bg-[#fef3c7] transition-colors">
                          撤回
                        </button>
                      )}
                      <button onClick={() => setDeleteId(t.id)} className="rounded px-2 py-1 text-xs text-[#ef4444] hover:bg-[#ef4444]/5 transition-colors">
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={tutorials.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#1e293b]">确认删除</h3>
            <p className="mt-2 text-sm text-[#64748b]">删除后无法恢复，确定要删除这条教程吗？</p>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="btn btn-secondary btn-sm">取消</button>
              <button onClick={() => handleDelete(deleteId)} className="btn btn-danger btn-sm">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
