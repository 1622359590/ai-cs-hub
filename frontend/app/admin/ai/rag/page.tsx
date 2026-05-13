'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface ChunkItem {
  id: number;
  title: string;
  content: string;
  source: string;
  category: string;
}

interface SearchResult {
  id: number;
  title: string;
  content: string;
  category: string;
  score: number;
  source: string;
}

export default function RagTestPage() {
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    loadChunks();
  }, []);

  const loadChunks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('imai-admin-token');
      const res = await fetch('/api/admin/ai/rag-chunks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setChunks(data.chunks || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const token = localStorage.getItem('imai-admin-token');
      const res = await fetch('/api/admin/ai/rag-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: query.trim(), topK: 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
      } else {
        showToast(data.error || '检索失败', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const token = localStorage.getItem('imai-admin-token');
      const res = await fetch('/api/admin/ai/rebuild-index', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast('索引重建成功', 'success');
        loadChunks();
      } else {
        showToast(data.error || '重建失败', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRebuilding(false);
    }
  };

  const sourceColors: Record<string, string> = {
    knowledge: 'bg-blue-100 text-blue-700',
    tutorial: 'bg-green-100 text-green-700',
    faq: 'bg-purple-100 text-purple-700',
  };

  const sourceLabels: Record<string, string> = {
    knowledge: '知识库',
    tutorial: '教程',
    faq: 'FAQ',
  };

  const filteredChunks = filter === 'all' ? chunks : chunks.filter(c => c.source === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#1e293b]">🔍 RAG 检索测试</h1>
          <p className="text-sm text-[#64748b] mt-1">查看向量块、测试检索效果</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadChunks} disabled={loading} className="btn btn-secondary btn-sm">
            {loading ? '加载中...' : '刷新'}
          </button>
          <button onClick={handleRebuild} disabled={rebuilding} className="btn btn-primary btn-sm">
            {rebuilding ? '重建中...' : '🔄 重建索引'}
          </button>
        </div>
      </div>

      {/* 检索测试区 */}
      <div className="card">
        <h2 className="text-sm font-semibold text-[#1e293b] mb-3">测试检索</h2>
        <div className="flex gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="输入问题测试检索效果，如：抖音怎么养号"
            className="input flex-1"
          />
          <button onClick={handleSearch} disabled={searching || !query.trim()} className="btn btn-primary btn-sm whitespace-nowrap">
            {searching ? '检索中...' : '🔍 检索'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-[#64748b]">返回 {results.length} 条结果：</p>
            {results.map((r, i) => (
              <div key={`${r.id}-${i}`} className="rounded-lg border border-[#e2e8f0] p-4 bg-[#f8fafc]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-[#1e293b]">#{i + 1}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${sourceColors[r.source] || 'bg-gray-100 text-gray-600'}`}>
                    {sourceLabels[r.source] || r.source}
                  </span>
                  {r.category && (
                    <span className="px-2 py-0.5 rounded text-xs bg-[#f1f5f9] text-[#64748b]">{r.category}</span>
                  )}
                  <span className="ml-auto text-xs font-mono text-[#8b5cf6]">score: {r.score.toFixed(4)}</span>
                </div>
                <p className="text-sm font-medium text-[#1e293b] mb-1">{r.title}</p>
                <p className="text-xs text-[#64748b] leading-relaxed whitespace-pre-wrap line-clamp-4">{r.content?.slice(0, 300)}{r.content && r.content.length > 300 ? '...' : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 向量块列表 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#1e293b]">
            向量块列表
            <span className="ml-2 text-xs font-normal text-[#94a3b8]">共 {filteredChunks.length} 块</span>
          </h2>
          <div className="flex gap-1">
            {['all', 'knowledge', 'tutorial', 'faq'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-[#8b5cf6] text-white'
                    : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                }`}
              >
                {f === 'all' ? '全部' : sourceLabels[f] || f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-[#f1f5f9]" />)}
          </div>
        ) : filteredChunks.length === 0 ? (
          <p className="text-sm text-[#94a3b8] text-center py-8">暂无数据</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredChunks.map(chunk => (
              <details key={chunk.id} className="rounded-lg border border-[#e2e8f0] overflow-hidden group">
                <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[#f8fafc] transition-colors">
                  <span className={`px-2 py-0.5 rounded text-xs ${sourceColors[chunk.source] || 'bg-gray-100 text-gray-600'}`}>
                    {sourceLabels[chunk.source] || chunk.source}
                  </span>
                  {chunk.category && (
                    <span className="px-2 py-0.5 rounded text-xs bg-[#f1f5f9] text-[#64748b]">{chunk.category}</span>
                  )}
                  <span className="text-sm text-[#1e293b] font-medium truncate flex-1">{chunk.title}</span>
                  <span className="text-xs text-[#94a3b8] font-mono">ID: {chunk.id}</span>
                  <svg className="w-4 h-4 text-[#94a3b8] transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </summary>
                <div className="px-4 py-3 bg-[#f8fafc] border-t border-[#e2e8f0]">
                  <p className="text-xs text-[#64748b] whitespace-pre-wrap leading-relaxed">{chunk.content}</p>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
