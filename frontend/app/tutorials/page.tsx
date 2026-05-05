'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { tutorialApi } from '@/lib/api';

// 分类列表由已加载教程动态生成，初始默认值
const defaultCategories = ['全部', '使用入门', 'AI获客', 'AI销售', '产品功能', '养号攻略', '常见问题'];

interface Tutorial {
  id: number;
  title: string;
  category: string;
  summary: string;
  cover: string;
  tags: string;
  views: number;
  created_at: string;
}

function TutorialsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || '全部');
  const [categories, setCategories] = useState(defaultCategories);

  useEffect(() => {
    const params: { category?: string; search?: string } = {};
    if (activeCategory !== '全部') params.category = activeCategory;
    if (search) params.search = search;

    // 仅首次加载显示 loading，切换分类时静默更新
    if (tutorials.length === 0) setLoading(true);

    tutorialApi.getList({}).then((res) => {
      const allTuts: Tutorial[] = res.tutorials || [];
      // 从全部教程中提取有数据的分类
      const catSet = new Set<string>();
      allTuts.forEach(t => catSet.add(t.category));
      setCategories(['全部', ...Array.from(catSet)]);
      // 根据筛选参数获取数据
      tutorialApi.getList(params).then((r) => {
        setTutorials(r.tutorials || []);
      }).catch(console.error).finally(() => setLoading(false));
    }).catch(console.error);
  }, [activeCategory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/tutorials?search=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <>
      <main className="min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold">教程中心</h1>
            <p className="mt-2 text-[#94a3b8]">AI获客系统使用教程与运营指南</p>
          </div>

          <form onSubmit={handleSearch} className="mx-auto mb-8 flex max-w-xl gap-2">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索教程..." className="input flex-1" />
            <button type="submit" className="btn btn-primary">搜索</button>
          </form>

          <div className="mb-8 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSearch(''); }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 ${
                  activeCategory === cat
                    ? 'bg-[#8b5cf6] text-white'
                    : 'bg-white text-[#94a3b8] border border-[#e2e8f0] hover:border-[#8b5cf6]'
                }`}>
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-4 w-16 rounded bg-[#e2e8f0]" />
                  <div className="mt-3 h-5 w-3/4 rounded bg-[#e2e8f0]" />
                  <div className="mt-2 h-4 w-2/3 rounded bg-[#e2e8f0]" />
                </div>
              ))}
            </div>
          ) : tutorials.length === 0 ? (
            <div className="py-20 text-center text-[#475569]">暂无教程，敬请期待</div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {tutorials.map((tutorial, i) => (
                <Link key={tutorial.id} href={`/tutorials/${tutorial.id}`} className="card group">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="tag">{tutorial.category}</span>
                    {JSON.parse(tutorial.tags || '[]').slice(0, 2).map((tag: string) => (
                      <span key={tag} className="tag" style={{ opacity: 0.6 }}>{tag}</span>
                    ))}
                  </div>
                  <h3 className="text-base font-semibold text-[#1e293b] group-hover:text-[#8b5cf6] transition-colors line-clamp-2">
                    {tutorial.title}
                  </h3>
                  {tutorial.summary && (
                    <p className="mt-1 text-sm text-[#94a3b8] line-clamp-2">{tutorial.summary}</p>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-xs text-[#475569]">
                    <span className="inline-flex items-center gap-1">
                      <svg className="w-4 h-4 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      {tutorial.views}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <svg className="w-4 h-4 text-[#94a3b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {tutorial.created_at?.split(' ')[0]}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function TutorialsPage() {
  return (
    <>
      <Header />
      <Suspense fallback={
        <main className="min-h-screen">
          <div className="mx-auto max-w-7xl px-4 py-12">
            <div className="animate-pulse space-y-4">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-8 rounded bg-[#e2e8f0]" />)}
            </div>
          </div>
        </main>
      }>
        <TutorialsContent />
      </Suspense>
    </>
  );
}
