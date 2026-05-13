'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)] p-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <svg className="h-8 w-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">页面出错了</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">抱歉，页面加载时遇到了问题</p>
        <button
          onClick={() => reset()}
          className="btn btn-primary mt-6"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
