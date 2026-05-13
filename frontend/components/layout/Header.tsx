'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import VIPBadge from '@/components/ui/VIPBadge';
import { authApi } from '@/lib/api';

interface User {
  id: number;
  phone: string;
  nickname: string;
  avatar: string;
  role: string;
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('imai-token');
    if (token) {
      authApi.getMe().then((res) => {
        setUser(res.user);
      }).catch(() => {
        localStorage.removeItem('imai-token');
      });
    }
  }, []);

  // 监听滚动，添加毛玻璃效果
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('imai-token');
    setUser(null);
    setUserMenuOpen(false);
    router.push('/');
  };

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const navLinks = [
    { href: '/', label: 'AI 助手', icon: '🤖' },
    { href: '/tutorials', label: '教程', icon: '📖' },
    { href: '/faq', label: 'FAQ', icon: '❓' },
    { href: '/ticket', label: '工单', icon: '🎫' },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-[#e2e8f0]/60 bg-white/70 shadow-sm shadow-[#8b5cf6]/5 backdrop-blur-xl'
          : 'border-b border-transparent bg-white/40 backdrop-blur-md'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] text-white shadow-md shadow-[#8b5cf6]/25 transition-transform group-hover:scale-105">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/>
              <line x1="9" y1="21" x2="15" y2="21"/>
              <line x1="10" y1="24" x2="14" y2="24"/>
            </svg>
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#10b981]" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-[#1e293b]">
              imai<span className="text-[#8b5cf6]">.work</span>
            </span>
            <span className="text-[10px] leading-none text-[#94a3b8] -mt-0.5">智能客服系统</span>
          </div>
        </Link>

        {/* Nav Links - Desktop */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? 'text-[#8b5cf6] bg-[#8b5cf6]/8'
                    : 'text-[#64748b] hover:text-[#8b5cf6] hover:bg-[#f8fafc]'
                }`}
              >
                <span className="text-xs">{link.icon}</span>
                {link.label}
                {active && (
                  <span className="absolute -bottom-[13px] left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-[#8b5cf6]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="hidden md:flex" ref={userMenuRef}>
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white/80 px-3 py-1.5 text-sm transition-all hover:border-[#8b5cf6]/40 hover:shadow-sm"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] text-[10px] font-bold text-white">
                    {(user.nickname || user.phone || '?')[0]}
                  </div>
                  <span className="max-w-[80px] truncate text-[13px] font-medium text-[#1e293b]">
                    {user.nickname || user.phone}
                  </span>
                  {(user as any).vip === 1 && <VIPBadge />}
                  <svg className={`w-3.5 h-3.5 text-[#94a3b8] transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {/* 用户下拉菜单 */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white/95 shadow-xl shadow-black/5 backdrop-blur-sm">
                    <div className="border-b border-[#f1f5f9] px-4 py-3">
                      <p className="text-sm font-semibold text-[#1e293b]">{user.nickname || '用户'}</p>
                      <p className="text-xs text-[#94a3b8]">{user.phone}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/ticket"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#64748b] hover:bg-[#f5f3ff] hover:text-[#8b5cf6] transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        我的工单
                      </Link>
                    </div>
                    <div className="border-t border-[#f1f5f9] py-1">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[#64748b] hover:bg-[#fef2f2] hover:text-[#ef4444] transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        退出登录
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-[#64748b] transition-colors hover:text-[#8b5cf6]">
                登录
              </Link>
              <Link href="/register" className="rounded-lg bg-gradient-to-r from-[#8b5cf6] to-[#a855f7] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm shadow-[#8b5cf6]/25 transition-all hover:shadow-md hover:shadow-[#8b5cf6]/30">
                注册
              </Link>
            </div>
          )}

          {/* Hamburger */}
          <button
            className="flex items-center justify-center rounded-lg p-2 text-[#94a3b8] hover:bg-[#f1f5f9] transition-colors md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="菜单"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`overflow-hidden transition-all duration-300 md:hidden ${
          menuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-[#e2e8f0]/60 bg-white/90 backdrop-blur-xl px-4 py-3">
          <nav className="space-y-1">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? 'text-[#8b5cf6] bg-[#8b5cf6]/8'
                      : 'text-[#64748b] hover:text-[#8b5cf6] hover:bg-[#f8fafc]'
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  {link.label}
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-3 border-t border-[#f1f5f9] pt-3">
            {user ? (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] text-xs font-bold text-white">
                    {(user.nickname || user.phone || '?')[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1e293b]">{user.nickname || user.phone}</p>
                    {(user as any).vip === 1 && <VIPBadge />}
                  </div>
                </div>
                <button
                  onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#94a3b8] hover:bg-[#fef2f2] hover:text-[#ef4444] transition-colors"
                >
                  退出
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" onClick={() => setMenuOpen(false)} className="flex-1 rounded-lg border border-[#e2e8f0] py-2 text-center text-sm font-medium text-[#64748b] hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-all">
                  登录
                </Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} className="flex-1 rounded-lg bg-gradient-to-r from-[#8b5cf6] to-[#a855f7] py-2 text-center text-sm font-medium text-white shadow-sm shadow-[#8b5cf6]/25">
                  注册
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
