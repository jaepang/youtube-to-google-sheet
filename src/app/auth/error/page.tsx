'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="max-w-md w-full space-y-8">
      <div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          로그인 오류
        </h2>
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-sm text-red-700">
            {error === 'AccessDenied' && '접근이 거부되었습니다. 권한을 확인해주세요.'}
            {error === 'Configuration' && '설정 오류가 발생했습니다. 관리자에게 문의해주세요.'}
            {!error && '알 수 없는 오류가 발생했습니다.'}
          </div>
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<div>로딩 중...</div>}>
        <ErrorContent />
      </Suspense>
    </div>
  );
} 