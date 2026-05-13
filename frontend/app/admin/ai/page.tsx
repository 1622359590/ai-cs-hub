'use client';

import { useState, useEffect, useRef } from 'react';
import { aiAdminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

interface KnowledgeItem {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const defaultCategories = ['自动学习', '养号技巧', '获客方法', '短视频运营', '平台规则', '产品功能', '常见问题'];

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', content: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewItems, setPreviewItems] = useState<{ title: string; content: string; category: string }[] | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 素材库
  const [showImages, setShowImages] = useState(false);
  const [imageList, setImageList] = useState<{ url: string; filename: string; size: number }[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imgSearch, setImgSearch] = useState('');
  const [imgPage, setImgPage] = useState(1);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const imgPageSize = 12;
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchItems = () => {
    setLoading(true);
    aiAdminApi.getKnowledge()
      .then(res => setItems(res.items || []))
      .catch(() => showToast('获取知识库失败', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  // 获取所有分类
  const categories = [...new Set([...defaultCategories, ...items.map(i => i.category).filter(Boolean)])];

  // 过滤后的条目
  const filtered = items.filter(item => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.content.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 加载图片列表
  const loadImages = async () => {
    try {
      const token = localStorage.getItem('imai-admin-token');
      const res = await fetch('/api/admin/upload/images', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setImageList(data.images || []);
      setImgPage(1);
      setSelectedImages(new Set());
      setImgSearch('');
    } catch {}
  };

  // 删除图片
  const handleDeleteImages = async (filenames: string[]) => {
    if (!confirm(`确定删除 ${filenames.length} 张图片？`)) return;
    try {
      const token = localStorage.getItem('imai-admin-token');
      for (const filename of filenames) {
        await fetch(`/api/admin/upload/images/${encodeURIComponent(filename)}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      }
      showToast(`已删除 ${filenames.length} 张图片`, 'success');
      setSelectedImages(new Set());
      loadImages();
    } catch {
      showToast('删除失败', 'error');
    }
  };

  // 图片筛选+分页
  const filteredImages = imageList.filter(img =>
    !imgSearch || img.filename.toLowerCase().includes(imgSearch.toLowerCase())
  );
  const imgTotalPages = Math.ceil(filteredImages.length / imgPageSize) || 1;
  const pagedImages = filteredImages.slice((imgPage - 1) * imgPageSize, imgPage * imgPageSize);

  // 切换选中
  const toggleSelectImage = (url: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  // 上传图片
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    try {
      const token = localStorage.getItem('imai-admin-token');
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('files', f));
      const res = await fetch('/api/admin/upload/images', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || '上传成功', 'success');
        loadImages();
      } else {
        showToast(data.error || '上传失败', 'error');
      }
    } catch {
      showToast('上传失败', 'error');
    } finally {
      setUploadingImages(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  // 文档导入：先预览
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await aiAdminApi.previewKnowledge(file);
      if (res.items.length === 0) {
        showToast('文档中没有解析到有效内容', 'error');
      } else {
        setPreviewItems(res.items);
        setPreviewFileName(file.name);
      }
    } catch (err: any) {
      showToast(err.message || '解析失败', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 确认导入
  const confirmImport = async () => {
    if (!previewItems) return;
    setImporting(true);
    try {
      const res = await aiAdminApi.importKnowledge(previewItems);
      showToast(res.message || '导入成功', 'success');
      setPreviewItems(null);
      fetchItems();
    } catch (err: any) {
      showToast(err.message || '导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  // 下载模板
  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/ai/knowledge/template';
    a.download = 'AI知识库导入模板.xlsx';
    a.click();
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ title: '', content: '', category: '养号技巧' });
    setShowEditor(true);
  };

  const openEdit = (item: KnowledgeItem) => {
    setEditingId(item.id);
    setForm({ title: item.title, content: item.content, category: item.category });
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      showToast('标题和内容必填', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await aiAdminApi.updateKnowledge(editingId, form);
        showToast('已更新', 'success');
      } else {
        await aiAdminApi.createKnowledge(form);
        showToast('已添加', 'success');
      }
      setShowEditor(false);
      fetchItems();
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这条知识？')) return;
    try {
      await aiAdminApi.deleteKnowledge(id);
      showToast('已删除', 'success');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleStatus = async (item: KnowledgeItem) => {
    const newStatus = item.status === 'active' ? 'hidden' : 'active';
    try {
      await aiAdminApi.updateKnowledge(item.id, { status: newStatus });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
      showToast(newStatus === 'active' ? '已启用' : '已隐藏', 'success');
    } catch {}
  };

  const handleApprove = async (item: KnowledgeItem) => {
    try {
      await aiAdminApi.approveKnowledge(item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'active' } : i));
      showToast('已通过审核', 'success');
    } catch {}
  };

  const pendingCount = items.filter(i => i.status === 'hidden' && i.category === '自动学习').length;

  return (
    <div className="space-y-6">
      {/* 顶部 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#1e293b]">AI 知识库</h1>
          <p className="text-xs text-[#94a3b8]">管理 AI 客服的专业知识，AI 回答时会自动参考</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.docx,.csv,.txt,.md" onChange={handleImport} className="hidden" />
          <button onClick={downloadTemplate} className="btn btn-secondary btn-sm">
            📋 下载模板
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn btn-secondary btn-sm">
            {importing ? '解析中...' : '📄 导入文档'}
          </button>
          <input ref={imgInputRef} type="file" accept="image/*" multiple onChange={handleUploadImages} className="hidden" />
          <button onClick={() => { setShowImages(true); loadImages(); }} className="btn btn-secondary btn-sm">🖼️ 图片管理</button>
          <button onClick={openCreate} className="btn btn-primary btn-sm">+ 添加知识</button>
        </div>
      </div>

      {/* 自动学习统计 */}
      {items.some(i => i.category === '自动学习') && (
        <div className="rounded-lg border border-[#8b5cf6]/20 bg-[#f5f3ff] p-3 flex items-center gap-3">
          <span className="text-lg">🧠</span>
          <div className="text-sm">
            <span className="font-medium text-[#6d28d9]">AI 自学习</span>
            <span className="text-[#7c3aed]"> 已积累 {items.filter(i => i.category === '自动学习').length} 条优秀回答</span>
            {pendingCount > 0 && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">⏳ {pendingCount} 条待审核</span>}
            <span className="text-[#94a3b8]"> · 用户点👍的内容会自动保存到这里</span>
          </div>
          <button onClick={() => setFilterCategory('自动学习')} className="ml-auto text-xs font-medium text-[#8b5cf6] hover:underline">查看全部 →</button>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg className="w-4 h-4 text-[#94a3b8] group-focus-within:text-[#8b5cf6] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索标题/内容"
            className="pl-9 pr-4 py-2 w-44 text-sm bg-white border border-[#e2e8f0] rounded-full outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all placeholder:text-[#94a3b8]"
          />
        </div>
        <div className="relative">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className={`appearance-none pl-3 pr-7 py-2 text-sm border rounded-full bg-white outline-none transition-all cursor-pointer ${filterCategory ? 'border-[#8b5cf6] text-[#8b5cf6] bg-[#f5f3ff]' : 'border-[#e2e8f0] text-[#64748b]'}`}
          >
            <option value="">全部分类</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <svg className="w-3.5 h-3.5 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <span className="text-sm text-[#94a3b8]">{filtered.length} / {items.length}</span>
      </div>

      {/* 知识列表 */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded bg-[#f1f5f9]" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-[#cbd5e1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
            <p className="mt-3 text-sm text-[#94a3b8]">知识库为空</p>
            <p className="mt-1 text-xs text-[#94a3b8]">添加知识后，AI 回答时会自动参考这些内容</p>
            <p className="mt-1 text-xs text-[#94a3b8]">点击「📄 导入文档」批量导入，或「+ 添加知识」手动创建</p>
          </div>
        ) : (
          <>
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-12">ID</th>
                <th>标题</th>
                <th>分类</th>
                <th>内容预览</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(item => (
                <tr key={item.id} className="group">
                  <td className="text-xs font-mono text-[#94a3b8]">{item.id}</td>
                  <td className="font-medium text-[#1e293b] max-w-[200px] truncate">{item.title}</td>
                  <td>
                    <span className="tag">{item.category || '未分类'}</span>
                    {item.category === '自动学习' && <span className="ml-1 text-[10px]">🧠</span>}
                  </td>
                  <td className="text-xs text-[#64748b] max-w-[300px] truncate">{item.content.slice(0, 80)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleStatus(item)} className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.status === 'active' ? 'bg-[#ecfdf5] text-[#059669]' : 'bg-[#f1f5f9] text-[#94a3b8]'}`}>
                        {item.status === 'active' ? '启用' : '隐藏'}
                      </button>
                      {item.status === 'hidden' && item.category === '自动学习' && (
                        <button onClick={() => handleApprove(item)} className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                          通过
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)} className="rounded px-2 py-1 text-xs text-[#64748b] hover:bg-[#f1f5f9]">编辑</button>
                      <button onClick={() => handleDelete(item.id)} className="rounded px-2 py-1 text-xs text-[#ef4444] hover:bg-[#fef2f2]">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {/* 编辑器弹窗 */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEditor(false)}>
          <div className="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#1e293b]">{editingId ? '编辑知识' : '添加知识'}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">标题</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="例如：抖音养号基本流程" className="input" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">分类</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, category: c }))}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${form.category === c ? 'border-[#8b5cf6] bg-[#f5f3ff] text-[#8b5cf6]' : 'border-[#e2e8f0] text-[#64748b]'}`}>
                      {c}
                    </button>
                  ))}
                </div>
                <input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="或自定义分类" className="input mt-2" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1e293b]">内容</label>
                <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="输入知识内容，支持分步骤、分点描述..." className="input" rows={10} />
                <p className="mt-1 text-xs text-[#94a3b8]">内容越详细，AI 回答越准确</p>
              </div>
            </div>
            <div className="flex gap-2 pt-5">
              <button onClick={() => setShowEditor(false)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 btn btn-primary btn-sm justify-center">{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入预览弹窗 */}
      {previewItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPreviewItems(null)}>
          <div className="card w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-[#1e293b]">导入预览</h3>
                <p className="text-xs text-[#94a3b8] mt-1">文件：{previewFileName} · 共 {previewItems.length} 条</p>
              </div>
              <button onClick={() => setPreviewItems(null)} className="p-1 rounded hover:bg-[#f1f5f9] text-[#94a3b8]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* 格式说明 */}
            <div className="rounded-lg bg-[#f0f9ff] border border-[#bae6fd] p-3 mb-4 text-xs text-[#0369a1]">
              <p className="font-medium mb-1">📄 支持的文档格式：</p>
              <p><b>Excel</b>（.xlsx）：第一行表头，需包含「标题」「内容」列，可选「分类」列</p>
              <p><b>Word</b>（.docx）：按标题（H1/H2）自动分段，每段标题即知识标题</p>
              <p><b>CSV/TXT</b>：每行一条，或按空行分段（第一行为标题）</p>
              <p className="mt-1 text-[#0284c7]">💡 不确定格式？先点「📋 下载模板」查看示例</p>
            </div>

            {/* 预览列表（最多显示50条） */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {previewItems.slice(0, 50).map((item, i) => (
                <div key={i} className="rounded-lg border border-[#e2e8f0] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 rounded">#{i + 1}</span>
                    <span className="text-sm font-medium text-[#1e293b] truncate">{item.title}</span>
                    {item.category && <span className="tag text-[10px]">{item.category}</span>}
                  </div>
                  <p className="text-xs text-[#64748b] line-clamp-2 whitespace-pre-wrap">{item.content.slice(0, 200)}{item.content.length > 200 ? '...' : ''}</p>
                </div>
              ))}
              {previewItems.length > 50 && (
                <div className="text-center text-xs text-[#94a3b8] py-2">还有 {previewItems.length - 50} 条未显示...</div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-3 border-t border-[#e2e8f0]">
              <button onClick={() => setPreviewItems(null)} className="flex-1 btn btn-secondary btn-sm justify-center">取消</button>
              <button onClick={confirmImport} disabled={importing} className="flex-1 btn btn-primary btn-sm justify-center">
                {importing ? '导入中...' : `确认导入 ${previewItems.length} 条`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 素材库弹窗 */}
      {showImages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowImages(false)}>
          <div className="card w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-[#1e293b]">素材库</h3>
                <span className="text-xs text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded-full">{imageList.length} 张</span>
              </div>
              <button onClick={() => setShowImages(false)} className="p-1 rounded hover:bg-[#f1f5f9] text-[#94a3b8]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* 工具栏 */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => imgInputRef.current?.click()} disabled={uploadingImages} className="btn btn-primary btn-sm">
                {uploadingImages ? '上传中...' : '📤 上传图片'}
              </button>
              {selectedImages.size > 0 && (
                <>
                  <button onClick={() => {
                    const md = Array.from(selectedImages).map(url => `![](${url})`).join('\n');
                    navigator.clipboard.writeText(md);
                    showToast(`已复制 ${selectedImages.size} 条链接`, 'success');
                  }} className="btn btn-secondary btn-sm">📋 复制选中</button>
                  <button onClick={() => handleDeleteImages(imageList.filter(img => selectedImages.has(img.url)).map(img => img.filename))} className="btn btn-secondary btn-sm text-[#ef4444] hover:bg-[#fef2f2]">🗑️ 删除选中</button>
                  <button onClick={() => setSelectedImages(new Set())} className="text-xs text-[#94a3b8] hover:text-[#64748b]">取消选择</button>
                </>
              )}
              <div className="flex-1" />
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input value={imgSearch} onChange={e => { setImgSearch(e.target.value); setImgPage(1); }} placeholder="搜索文件名" className="pl-8 pr-3 py-1.5 w-40 text-xs bg-white border border-[#e2e8f0] rounded-full outline-none focus:border-[#8b5cf6] transition-all" />
              </div>
            </div>

            {/* 图片网格 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredImages.length === 0 ? (
                <div className="py-16 text-center">
                  <svg className="mx-auto h-12 w-12 text-[#cbd5e1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <p className="mt-3 text-sm text-[#94a3b8]">{imgSearch ? '没有匹配的图片' : '暂无素材，点击上传'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {pagedImages.map((img) => (
                    <div key={img.url} className={`group relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${selectedImages.has(img.url) ? 'border-[#8b5cf6] ring-1 ring-[#8b5cf6]/30' : 'border-[#e2e8f0] hover:border-[#cbd5e1]'}`}>
                      {/* 选中复选框 */}
                      <div className="absolute top-1.5 left-1.5 z-10" onClick={(e) => { e.stopPropagation(); toggleSelectImage(img.url); }}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedImages.has(img.url) ? 'bg-[#8b5cf6] border-[#8b5cf6]' : 'bg-white/80 border-[#cbd5e1] group-hover:border-[#8b5cf6]'}`}>
                          {selectedImages.has(img.url) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                      {/* 预览按钮 */}
                      <button onClick={() => setPreviewImage(img.url)} className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded p-0.5">
                        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      {/* 图片 */}
                      <img src={img.url} alt={img.filename} className="w-full h-24 object-cover" onClick={() => setPreviewImage(img.url)} />
                      {/* 信息栏 */}
                      <div className="px-2 py-1.5 bg-white">
                        <p className="text-[10px] text-[#64748b] truncate">{img.filename}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-[#94a3b8]">{(img.size / 1024).toFixed(0)}KB</span>
                          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`![](${img.url})`); showToast('已复制', 'success'); }} className="text-[10px] text-[#8b5cf6] hover:underline">复制链接</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 分页 + 全选 */}
            {filteredImages.length > 0 && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#e2e8f0]">
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const allOnPage = pagedImages.map(i => i.url);
                    setSelectedImages(prev => {
                      const next = new Set(prev);
                      const allSelected = allOnPage.every(u => next.has(u));
                      if (allSelected) { allOnPage.forEach(u => next.delete(u)); } else { allOnPage.forEach(u => next.add(u)); }
                      return next;
                    });
                  }} className="text-xs text-[#64748b] hover:text-[#8b5cf6]">
                    {pagedImages.every(i => selectedImages.has(i.url)) ? '取消全选' : '全选当页'}
                  </button>
                  {selectedImages.size > 0 && <span className="text-xs text-[#8b5cf6]">已选 {selectedImages.size} 张</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setImgPage(p => Math.max(1, p - 1))} disabled={imgPage <= 1} className="rounded px-2 py-1 text-xs text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30">上一页</button>
                  <span className="text-xs text-[#94a3b8] px-2">{imgPage} / {imgTotalPages}</span>
                  <button onClick={() => setImgPage(p => Math.min(imgTotalPages, p + 1))} disabled={imgPage >= imgTotalPages} className="rounded px-2 py-1 text-xs text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30">下一页</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={previewImage} alt="预览" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
            <button onClick={() => setPreviewImage(null)} className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-lg">
              <svg className="w-4 h-4 text-[#64748b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg px-4 py-2 flex items-center justify-between">
              <span className="text-xs text-white/80 truncate">{previewImage.split('/').pop()}</span>
              <button onClick={() => { navigator.clipboard.writeText(`![](${previewImage})`); showToast('已复制', 'success'); }} className="text-xs text-white hover:underline">复制链接</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
