'use client';

import { useState } from 'react';
import { FaYoutube } from 'react-icons/fa';
import { signIn, signOut, useSession } from 'next-auth/react';

interface Props {
  spreadsheetUrl: string;
}

export default function HomeClient({ spreadsheetUrl }: Props) {
  const { data: session, status } = useSession();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session) {
      await signIn('google');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      }

      if (data.success) {
        alert(`파싱 결과:\n\n아티스트: ${data.data.channelTitle}\n곡명: ${data.data.title}\n\n구글 시트에 성공적으로 추가되었습니다!`);
        setUrl('');
      } else {
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      }
    } catch (err: any) {
      console.error('에러 상세:', err);
      const errorMessage = err.message || '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
      alert(`오류 발생:\n\n${errorMessage}\n\n자세한 내용은 개발자 도구의 콘솔을 확인해주세요.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FaYoutube className="text-red-600 text-2xl" />
              <h1 className="text-xl font-bold text-gray-900">유튜브 음악 정보 수집기</h1>
            </div>
            {session ? (
              <button
                onClick={() => signOut()}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                로그아웃
              </button>
            ) : null}
          </div>
          
          {!session ? (
            <button
              onClick={() => signIn('google')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Google 계정으로 로그인
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 text-center mb-4"
              >
                선곡 시트 보러가기
              </a>
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
                  유튜브 URL
                </label>
                <input
                  type="text"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm p-3 bg-red-50 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '처리 중...' : '구글 시트에 추가'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

