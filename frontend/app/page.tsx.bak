'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { tutorialApi, faqApi } from '@/lib/api';

interface Tutorial {
  id: number;
  title: string;
  category: string;
  summary: string;
  cover: string;
  tags: string;
  views: number;
  status: string;
  created_at: string;
}

interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string;
}

interface Category {
  id: number;
  name: string;
  icon: string;
}

const categoryColors: Record<string, string> = {
  '使用入门': '#8b5cf6',
  'AI获客': '#00d4ff',
  'AI销售': '#10b981',
  '产品功能': '#f59e0b',
  '养号攻略': '#ef4444',
  '常见问题': '#6366f1',
  '抖音': '#ff4444',
  '快手': '#ff6b35',
  '小红书': '#ff2442',
  '微信': '#07c160',
  '其他': '#8b5cf6',
};

const iconSvgs: Record<string, React.ReactNode> = {
  music: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  video: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="10 8 16 12 10 16"/></svg>,
  book: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  'message-circle': <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  'help-circle': <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  rocket: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  zap: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  'trending-up': <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  box: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  shield: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      tutorialApi.getList({}),
      faqApi.getList({}),
    ]).then(([tutorialRes, faqRes]) => {
      const allTutorials: Tutorial[] = tutorialRes.tutorials || [];
      setTutorials(allTutorials.slice(0, 6));
      setFaqs((faqRes.faqs || []).slice(0, 6));
      // 从教程中提取有数据的分类
      const catMap = new Map<string, { name: string; icon: string }>();
      const iconMap: Record<string, string> = { '使用入门': 'rocket', 'AI获客': 'zap', 'AI销售': 'trending-up', '产品功能': 'box', '养号攻略': 'shield', '常见问题': 'help-circle', '抖音': 'music', '快手': 'video', '小红书': 'book', '微信': 'message-circle' };
      allTutorials.forEach(t => {
        if (!catMap.has(t.category)) {
          catMap.set(t.category, { name: t.category, icon: iconMap[t.category] || 'help-circle' });
        }
      });
      setCategories(Array.from(catMap.values()).map((c, i) => ({ id: i + 1, name: c.name, icon: c.icon })));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);


  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/tutorials?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const getColor = (name: string) => categoryColors[name] || '#8b5cf6';

  const getIcon = (cat: Category) => {
    const svg = iconSvgs[cat.icon];
    if (svg) return svg;
    return <span className="text-2xl">{cat.name[0]}</span>;
  };

  return (
    <>
      <Header />
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#f5f3ff] via-white to-[#ede9fe] py-20 sm:py-28">
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] bg-clip-text text-transparent">
                imai.work
              </span>
            </h1>
            <p className="mt-4 text-lg text-[#64748b] sm:text-xl">未来将是无人工</p>
            <form onSubmit={handleSearch} className="mx-auto mt-8 flex max-w-xl gap-2">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索教程..." className="input flex-1" />
              <button type="submit" className="btn btn-primary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>搜索
              </button>
            </form>
          </div>
        </section>

        {/* Category Cards */}
        <section className="border-b border-[#e2e8f0] bg-white py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-8 text-center text-2xl font-bold text-[#1e293b]">学习文章</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {categories.map((cat) => {
                const color = getColor(cat.name);
                return (
                  <Link key={cat.id} href={`/tutorials?category=${encodeURIComponent(cat.name)}`}
                    className="card group flex cursor-pointer flex-col items-center gap-3 py-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full text-2xl transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${color}15`, color }}>
                      {getIcon(cat)}
                    </div>
                    <span className="text-sm font-medium text-[#64748b] group-hover:text-[#8b5cf6] transition-colors">
                      {cat.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Latest Tutorials */}
        <section className="border-b border-[#e2e8f0] bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#1e293b]">最新教程</h2>
              <Link href="/tutorials" className="text-sm text-[#8b5cf6] hover:underline">查看全部 &rarr;</Link>
            </div>
            {loading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="h-4 w-16 rounded bg-[#f1f5f9]" /><div className="mt-3 h-5 w-3/4 rounded bg-[#f1f5f9]" />
                    <div className="mt-2 h-4 w-full rounded bg-[#f1f5f9]" /><div className="mt-2 h-4 w-2/3 rounded bg-[#f1f5f9]" />
                  </div>
                ))}
              </div>
            ) : tutorials.length === 0 ? (
              <div className="py-12 text-center text-[#94a3b8]">暂无教程，敬请期待</div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {tutorials.map((tutorial) => (
                  <Link key={tutorial.id} href={`/tutorials/${tutorial.id}`} className="card group">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="tag">{tutorial.category}</span>
                      {(tutorial as any).vip_only === 1 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#fef3c7] text-[#d97706] border border-[#f59e0b]/30">🔒 VIP</span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-[#1e293b] group-hover:text-[#8b5cf6] transition-colors line-clamp-2">{tutorial.title}</h3>
                    {tutorial.summary && <p className="mt-1 text-sm text-[#64748b] line-clamp-2">{tutorial.summary}</p>}
                    <div className="mt-3 flex items-center gap-4 text-xs text-[#94a3b8]">
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
        </section>

        {/* FAQ Section */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#1e293b]">常见问题</h2>
              <Link href="/faq" className="text-sm text-[#8b5cf6] hover:underline">查看全部 &rarr;</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => (
                <div key={i} className="card animate-pulse"><div className="h-5 w-3/4 rounded bg-[#f1f5f9]" /></div>))}
              </div>
            ) : faqs.length === 0 ? (
              <div className="py-12 text-center text-[#94a3b8]">暂无常见问题</div>
            ) : (
              <div className="space-y-3">
                {faqs.map((faq) => (
                  <div key={faq.id} className="card cursor-pointer" onClick={() => setActiveFaq(activeFaq === faq.id ? null : faq.id)}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-[#1e293b]">{faq.question}</h3>
                      <svg className={`h-4 w-4 text-[#94a3b8] transition-transform duration-200 ${activeFaq === faq.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className={`accordion-grid ${activeFaq === faq.id ? 'open' : ''}`}>
                      <div>
                        <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
                          <p className="text-sm leading-relaxed text-[#64748b]">{faq.answer}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-[#e2e8f0] bg-gradient-to-br from-[#f5f3ff] to-white py-20 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-2xl font-bold text-[#1e293b]">遇到问题？我们帮你解决</h2>
            <p className="mt-2 text-[#64748b]">提交工单，我们的技术支持团队会尽快与你联系</p>
            <Link href="/ticket" className="btn btn-primary mt-6">
              提交工单
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
