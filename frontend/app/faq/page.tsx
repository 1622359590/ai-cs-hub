'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { faqApi } from '@/lib/api';

const defaultCategories = ['全部', '使用入门', 'AI获客', 'AI销售', '产品功能', '养号攻略', '常见问题', '通用'];

interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string;
  pinned: number;
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [categories, setCategories] = useState(defaultCategories);

  useEffect(() => {
    const params: { category?: string; search?: string } = {};
    if (activeCategory !== '全部') params.category = activeCategory;
    if (search) params.search = search;

    // 仅首次加载显示 loading，切换分类时静默更新
    if (faqs.length === 0) setLoading(true);

    faqApi.getList({}).then((allRes) => {
      const allFaqs: Faq[] = allRes.faqs || [];
      const catSet = new Set<string>();
      allFaqs.forEach(f => catSet.add(f.category));
      setCategories(['全部', ...Array.from(catSet)]);
      // 按筛选参数获取数据
      faqApi.getList(params).then((res) => {
        setFaqs(res.faqs || []);
      }).catch(console.error).finally(() => setLoading(false));
    }).catch(console.error);
  }, [activeCategory, search]);

  return (
    <>
      <Header />
      <main className="min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          {/* 页面标题 */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold">常见问题 FAQ</h1>
            <p className="mt-2 text-[#94a3b8]">快速找到你需要的答案</p>
          </div>

          {/* 搜索 */}
          <div className="mx-auto mb-6 max-w-xl">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索问题..."
              className="input"
            />
          </div>

          {/* 分类 */}
          <div className="mb-8 flex flex-wrap gap-2">
            {categories.map((cat, ci) => (
              <button
                key={ci}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 ${
                  activeCategory === cat
                    ? 'bg-[#8b5cf6] text-white'
                    : 'bg-white text-[#94a3b8] border border-[#e2e8f0] hover:border-[#8b5cf6]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* FAQ 列表 */}
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-5 w-3/4 rounded bg-[#e2e8f0]" />
                </div>
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <div className="py-20 text-center text-[#475569]">
              {search ? '没有找到匹配的问题' : '暂无常见问题'}
            </div>
          ) : (
            <div className="space-y-3">
              {faqs.map((faq) => (
                <div
                  key={faq.id}
                  className="card cursor-pointer"
                  onClick={() => setActiveId(activeId === faq.id ? null : faq.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {faq.pinned === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6]">置顶</span>
                      )}
                      <h3 className="text-sm font-medium text-[#1e293b]">{faq.question}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tag text-xs">{faq.category}</span>
                      <svg
                        className={`h-4 w-4 flex-shrink-0 text-[#475569] transition-transform duration-200 ${
                          activeId === faq.id ? 'rotate-180' : ''
                        }`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className={`accordion-grid ${activeId === faq.id ? 'open' : ''}`}>
                    <div>
                      <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
                        <p className="text-sm leading-relaxed text-[#94a3b8] whitespace-pre-wrap">{faq.answer}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
