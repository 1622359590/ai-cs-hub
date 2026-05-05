'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import RichEditor from '@/components/ui/RichEditor';

export default function NewTutorialPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('使用入门');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [publishDirect, setPublishDirect] = useState(false);
  const [vipOnly, setVipOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) { showToast('请输入标题', 'error'); return; }
    setSaving(true);
    try {
      const tagArr = tags ? tags.split(/[,，\s]+/).filter(Boolean) : [];
      await adminApi.createTutorial({
        title: title.trim(),
        category,
        content,  // WangEditor 输出的 HTML
        summary: summary.trim(),
        tags: JSON.stringify(tagArr),
        status: publishDirect ? 'published' : 'draft',
        vip_only: vipOnly,
      });
      showToast(publishDirect ? '教程已发布' : '草稿已保存', 'success');
      router.push('/admin/tutorials');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/admin/tutorials" className="text-[#64748b] hover:text-[#8b5cf6]">教程管理</Link>
        <span className="text-[#cbd5e1]">/</span>
        <span className="text-[#1e293b] font-medium">新建教程</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <label className="mb-1.5 block text-xs font-medium text-[#64748b]">标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="教程标题" className="input text-base" />
          </div>

          <div className="card !p-0 overflow-hidden border-[#e2e8f0]">
            <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <span className="text-xs font-medium text-[#64748b]">正文（富文本）</span>
            </div>
            <RichEditor
              value={content}
              onChange={setContent}
              placeholder="在这里输入内容...\n支持拖放或粘贴上传图片和视频"
              height={500}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-[#1e293b] mb-4">发布设置</h3>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-[#64748b]">分类</label>
              <input value={category} onChange={e => setCategory(e.target.value)}
                placeholder="输入分类名称" className="input text-sm" />
              <p className="mt-1 text-xs text-[#94a3b8]">支持自定义分类</p>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-[#64748b]">标签</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="空格分隔" className="input text-sm" />
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
              <span className="text-xs font-medium text-[#1e293b]">直接发布</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={publishDirect} onChange={e => setPublishDirect(e.target.checked)} className="peer sr-only" />
                <div className="h-5 w-9 rounded-full border border-[#e2e8f0] bg-[#e2e8f0] after:absolute after:left-[0.5px] after:top-[0.5px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:bg-[#8b5cf6] peer-checked:after:translate-x-full" />
              </label>
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
            <textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="简要描述" className="input text-sm" rows={3} />
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setPublishDirect(false); handleSubmit(); }} disabled={saving}
              className="flex-1 btn btn-secondary btn-sm justify-center">
              {saving ? '保存中...' : '保存草稿'}
            </button>
            <button onClick={() => { setPublishDirect(true); handleSubmit(); }} disabled={saving}
              className="flex-1 btn btn-primary btn-sm justify-center">
              {saving ? '保存中...' : '发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
