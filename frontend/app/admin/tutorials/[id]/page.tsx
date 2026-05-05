'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import RichEditor from '@/components/ui/RichEditor';

const categories = ['使用入门', 'AI获客', 'AI销售', '产品功能', '养号攻略', '常见问题', '其他'];

export default function EditTutorialPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('抖音');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [vipOnly, setVipOnly] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    adminApi.getTutorial(params.id as string).then(res => {
      const t = res.tutorial;
      setTitle(t.title);
      setCategory(t.category);
      setContent(t.content);
      setSummary(t.summary || '');
      setTags(JSON.parse(t.tags || '[]').join(' '));
      setStatus(t.status);
      setVipOnly(t.vip_only === 1);
    }).catch(() => {
      showToast('加载失败', 'error');
      router.push('/admin/tutorials');
    }).finally(() => setLoading(false));
  }, [params.id, router]);

  const handleSubmit = async (publishDirect?: boolean) => {
    if (!title.trim()) { showToast('请输入标题', 'error'); return; }
    setSaving(true);
    try {
      const tagArr = tags ? tags.split(/[,，\s]+/).filter(Boolean) : [];
      await adminApi.updateTutorial(params.id as string, {
        title: title.trim(),
        category,
        content,
        summary: summary.trim(),
        tags: JSON.stringify(tagArr),
        status: publishDirect ? 'published' : status,
        vip_only: vipOnly,
      });
      showToast(publishDirect ? '已发布' : '已保存', 'success');
      router.push('/admin/tutorials');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1,2,3,4,5].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-[#f1f5f9]" />)}</div>;
  }

  const isPublished = status === 'published';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/admin/tutorials" className="text-[#64748b] hover:text-[#8b5cf6]">教程管理</Link>
        <span className="text-[#cbd5e1]">/</span>
        <span className="text-[#1e293b] font-medium truncate max-w-[200px]">{title}</span>
        <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isPublished ? 'bg-[#ecfdf5] text-[#059669]' : 'bg-[#fef3c7] text-[#d97706]'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isPublished ? 'bg-[#10b981]' : 'bg-[#f59e0b]'}`} />
          {isPublished ? '已发布' : '草稿'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <label className="mb-1.5 block text-xs font-medium text-[#64748b]">标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input text-base" />
          </div>

          <div className="card !p-0 overflow-hidden border-[#e2e8f0]">
            <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <span className="text-xs font-medium text-[#64748b]">正文（富文本）</span>
            </div>
            <RichEditor
              value={content}
              onChange={setContent}
              placeholder="在这里编辑内容...\n支持拖放或粘贴上传图片和视频"
              height={500}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-[#1e293b] mb-4">发布设置</h3>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-[#64748b]">分类</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      category === c ? 'bg-[#8b5cf6] text-white' : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                    }`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-[#64748b]">标签</label>
              <input value={tags} onChange={e => setTags(e.target.value)} className="input text-sm" />
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-[#f59e0b]/20 bg-[#fef3c7] mt-3">
              <span className="text-xs font-medium text-[#d97706]">🔒 VIP 专属</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={vipOnly} onChange={e => setVipOnly(e.target.checked)} className="peer sr-only" />
                <div className="h-5 w-9 rounded-full border border-[#e2e8f0] bg-[#e2e8f0] after:absolute after:left-[0.5px] after:top-[0.5px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:bg-[#d97706] peer-checked:after:translate-x-full" />
              </label>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-[#1e293b] mb-4">摘要</h3>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} className="input text-sm" rows={3} />
          </div>

          <div className="flex gap-2">
            {!isPublished ? (
              <button onClick={() => handleSubmit()} disabled={saving}
                className="flex-1 btn btn-secondary btn-sm justify-center">
                {saving ? '保存中...' : '保存草稿'}
              </button>
            ) : (
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await adminApi.updateTutorial(params.id as string, { status: 'draft' });
                    showToast('已撤回为草稿', 'success');
                    setStatus('draft');
                  } catch (err: any) {
                    showToast(err.message, 'error');
                  } finally { setSaving(false); }
                }}
                disabled={saving}
                className="flex-1 btn btn-secondary btn-sm justify-center border-[#f59e0b] text-[#f59e0b] hover:bg-[#fef3c7]">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10h13a3 3 0 013 3v0a3 3 0 01-3 3H7"/>
                  <path d="M7 12l-4 4 4 4"/>
                </svg>
                撤回草稿
              </button>
            )}
            <button onClick={() => handleSubmit(true)} disabled={saving}
              className="flex-1 btn btn-primary btn-sm justify-center">
              {saving ? '保存中...' : isPublished ? '保存更新' : '发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
