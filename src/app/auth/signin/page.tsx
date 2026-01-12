'use client';

import { signIn } from 'next-auth/react';
import { FaGoogle } from 'react-icons/fa';

export default function SignIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            유튜브 음악 정보 수집기
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Google 계정으로 로그인하여 시작하세요
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
          >
            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
              <FaGoogle className="h-5 w-5 text-blue-500 group-hover:text-blue-400" />
            </span>
            Google로 로그인
          </button>
        </div>
      </div>
    </div>
  );
} 