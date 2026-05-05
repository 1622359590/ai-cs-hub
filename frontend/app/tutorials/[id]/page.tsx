'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { tutorialApi } from '@/lib/api';

interface Tutorial {
  id: number;
  title: string;
  category: string;
  content: string;
  summary: string;
  cover: string;
  tags: string;
  views: number;
  created_at: string;
  updated_at: string;
}

export default function TutorialDetailPage() {
  const params = useParams();
  const [tutorial, setTutorial] = useState<Tutorial | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    tutorialApi.getDetail(params.id as string).then((res) => {
      setTutorial(res.tutorial);
      // 延迟触发阅读计数，避免预取/爬虫
      const timer = setTimeout(() => {
        fetch(`/api/tutorials/${params.id}/view`, { method: 'POST' }).catch(() => {});
      }, 3000);
      return () => clearTimeout(timer);
    }).catch(console.error).finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-screen">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-20 rounded bg-[#e2e8f0]" />
              <div className="h-10 w-3/4 rounded bg-[#e2e8f0]" />
              <div className="h-4 w-40 rounded bg-[#e2e8f0]" />
              <div className="mt-8 space-y-3">
                {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-4 w-full rounded bg-[#e2e8f0]" />)}
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!tutorial) {
    return (
      <>
        <Header />
        <main className="min-h-screen">
          <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
            <h1 className="text-2xl font-bold">教程不存在</h1>
            <Link href="/tutorials" className="btn btn-primary mt-6">返回教程列表</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen">
        <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          {/* 面包屑 */}
          <nav className="mb-6 flex items-center gap-2 text-sm text-[#475569]">
            <Link href="/" className="hover:text-[#8b5cf6]">首页</Link>
            <span>/</span>
            <Link href="/tutorials" className="hover:text-[#8b5cf6]">教程</Link>
            <span>/</span>
            <span className="text-[#94a3b8]">{tutorial.title}</span>
          </nav>

          {/* 分类 */}
          <div className="mb-4 flex items-center gap-2">
            <span className="tag">{tutorial.category}</span>
            {tutorial.tags && JSON.parse(tutorial.tags || '[]').slice(0, 3).map((tag: string) => (
              <span key={tag} className="tag" style={{ opacity: 0.6 }}>{tag}</span>
            ))}
          </div>

          {/* 标题 */}
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{tutorial.title}</h1>

          {/* 元信息 */}
          <div className="mt-3 flex items-center gap-4 text-sm text-[#475569]">
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4 text-[#475569]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {tutorial.views} 阅读
            </span>
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4 text-[#475569]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {tutorial.created_at?.split(' ')[0]}
            </span>
          </div>

          {/* 封面图 */}
          {tutorial.cover ? (
            <div className="mt-8 overflow-hidden rounded-xl">
              <img src={tutorial.cover} alt={tutorial.title} className="w-full object-cover" />
            </div>
          ) : null}

          {/* VIP 锁定提示 */}
          {(tutorial as any).vip_locked ? (
            <div className="mt-10 rounded-xl border-2 border-dashed border-[#f59e0b]/30 bg-[#fef3c7]/30 p-12 text-center">
              <svg className="mx-auto h-16 w-16 text-[#f59e0b]/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <h2 className="mt-4 text-xl font-bold text-[#d97706]">🔒 VIP 专属内容</h2>
              <p className="mt-2 text-sm text-[#b45309]">此教程仅限 VIP 会员查看，开通后即可解锁全部内容</p>
              <Link href="/vip" className="btn btn-primary mt-6">开通 VIP</Link>
            </div>
          ) : (
            <>
          {/* 正文 */}
          <div className="markdown-body mt-10">
            {tutorial.content?.trim().startsWith('<') ? (
              <div dangerouslySetInnerHTML={{ __html: tutorial.content }} />
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {tutorial.content}
              </ReactMarkdown>
            )}
          </div>
            </>
          )}

          {/* 底部 CTA */}
          <div className="mt-16 rounded-xl border border-[#e2e8f0] bg-white p-8 text-center">
            <h3 className="text-lg font-semibold">还没解决你的问题？</h3>
            <p className="mt-1 text-sm text-[#94a3b8]">问问 iami 小助手，它能帮你快速解答</p>
            <Link href="/support" className="btn btn-primary mt-4">
              咨询小助手
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
