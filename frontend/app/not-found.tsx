import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)] p-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-[var(--accent)]">404</p>
        <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">页面不存在</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">你访问的页面已被移除或不存在</p>
        <Link href="/" className="btn btn-primary mt-6 inline-flex">
          返回首页
        </Link>
      </div>
    </div>
  );
}
