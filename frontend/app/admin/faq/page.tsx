'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

const categories = ['通用', '使用入门', 'AI获客', 'AI销售', '产品功能', '养号攻略', '常见问题'];

interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  pinned: number;
  status: string;
}

export default function AdminFAQPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editFaq, setEditFaq] = useState<Partial<Faq> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pagedFaqs = faqs.slice((page - 1) * pageSize, page * pageSize);

  const fetchFaqs = () => {
    setLoading(true);
    adminApi.getFaqs().then(res => {
      setFaqs(res.faqs || []);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchFaqs(); }, []);

  const openNew = () => {
    setEditFaq({ question: '', answer: '', category: '通用', sort_order: 0, pinned: 0, status: 'active' });
    setShowModal(true);
  };

  const openEdit = (faq: Faq) => {
    setEditFaq({ ...faq });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editFaq?.question?.trim() || !editFaq?.answer?.trim()) {
      showToast('请填写问题与答案', 'error');
      return;
    }
    try {
      if (editFaq.id) {
        await adminApi.updateFaq(editFaq.id, editFaq as any);
        showToast('更新成功', 'success');
      } else {
        await adminApi.createFaq(editFaq as any);
        showToast('创建成功', 'success');
      }
      setShowModal(false);
      setEditFaq(null);
      fetchFaqs();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteFaq(id);
      showToast('删除成功', 'success');
      setDeleteId(null);
      fetchFaqs();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#1e293b]">FAQ 管理</h1>
          <button onClick={openNew} className="btn btn-primary btn-sm">+ 新建 FAQ</button>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
        ) : faqs.length === 0 ? (
          <div className="mt-8 py-12 text-center text-[#94a3b8]">暂无FAQ</div>
        ) : (
          <>
          <table className="mt-6 w-full">
            <thead>
              <tr>
                <th>问题</th>
                <th>分类</th>
                <th>排序</th>
                <th>置顶</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedFaqs.map((f) => (
                <tr key={f.id}>
                  <td className="font-medium max-w-[300px] truncate">{f.question}</td>
                  <td><span className="tag">{f.category}</span></td>
                  <td>{f.sort_order}</td>
                  <td>{f.pinned === 1 ? '📌' : '-'}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      f.status === 'active' ? 'text-[#10b981]' : 'text-[#94a3b8]'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${f.status === 'active' ? 'bg-[#10b981]' : 'bg-[#94a3b8]'}`} />
                      {f.status === 'active' ? '启用' : '隐藏'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(f)} className="rounded px-2 py-1 text-xs text-[#8b5cf6] hover:bg-[#8b5cf6]/5">编辑</button>
                      <button onClick={() => setDeleteId(f.id)} className="rounded px-2 py-1 text-xs text-[#ef4444] hover:bg-[#ef4444]/5">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={faqs.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {/* 编辑弹窗 */}
      {showModal && editFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="card w-full max-w-lg mx-4" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 className="text-base font-semibold text-[#1e293b]">{editFaq.id ? '编辑 FAQ' : '新建 FAQ'}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">问题 *</label>
                <input value={editFaq.question} onChange={e => setEditFaq({ ...editFaq, question: e.target.value })}
                  placeholder="输入问题" className="input" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">答案 *</label>
                <textarea value={editFaq.answer} onChange={e => setEditFaq({ ...editFaq, answer: e.target.value })}
                  placeholder="输入答案" className="input" rows={4} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">分类</label>
                  <select value={editFaq.category} onChange={e => setEditFaq({ ...editFaq, category: e.target.value })} className="select">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">排序值</label>
                  <input type="number" value={editFaq.sort_order} onChange={e => setEditFaq({ ...editFaq, sort_order: Number(e.target.value) })} className="input" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">状态</label>
                  <select value={editFaq.status} onChange={e => setEditFaq({ ...editFaq, status: e.target.value })} className="select">
                    <option value="active">启用</option>
                    <option value="hidden">隐藏</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pinned" checked={editFaq.pinned === 1}
                  onChange={e => setEditFaq({ ...editFaq, pinned: e.target.checked ? 1 : 0 })} />
                <label htmlFor="pinned" className="text-sm text-[#64748b]">置顶</label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-[#e2e8f0]">
                <button onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">取消</button>
                <button onClick={handleSave} className="btn btn-primary btn-sm">保存</button>
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
            <p className="mt-2 text-sm text-[#64748b]">确定要删除这条 FAQ 吗？</p>
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
