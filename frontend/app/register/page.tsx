'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const validatePhone = (val: string) => {
    if (val && !/^1\d{10}$/.test(val)) {
      setPhoneError('手机号格式不正确');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validatePhone(phone)) return;
    if (!phone || !password) { setError('请填写手机号和密码'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }
    if (password !== confirmPassword) { setError('两次密码不一致'); return; }

    setLoading(true);
    try {
      const res = await authApi.register(phone, password, nickname || undefined);
      localStorage.setItem('imai-token', res.token);
      router.push('/');
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] text-white shadow-lg shadow-[#8b5cf6]/25">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/>
              <line x1="9" y1="21" x2="15" y2="21"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1e293b]">
            imai<span className="text-[#8b5cf6]">.work</span>
          </h1>
          <p className="mt-1 text-sm text-[#94a3b8]">创建你的账号</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#64748b]">手机号 *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
              onBlur={() => validatePhone(phone)}
              placeholder="请输入手机号"
              className={`input input-lg ${phoneError ? '!border-red-400 !ring-red-400/20' : ''}`}
              maxLength={11}
            />
            {phoneError && <p className="mt-1.5 text-xs text-red-500">{phoneError}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#64748b]">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="给自己取个名字"
              className="input input-lg"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#64748b]">密码 *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少6位密码"
              className="input input-lg"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#64748b]">确认密码 *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              className="input input-lg"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center text-base py-3 rounded-xl">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                注册中...
              </span>
            ) : '注册'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#64748b]">
          已有账号？
          <Link href="/login" className="ml-1 font-medium text-[#8b5cf6] hover:underline">去登录</Link>
        </div>
      </div>
    </div>
  );
}
