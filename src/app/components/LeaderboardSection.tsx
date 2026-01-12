'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface LeaderboardItem {
  artist: string;
  title: string;
  sheetName: string;
}

export default function LeaderboardSection() {
  const { data: session } = useSession();
  const [data, setData] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleAuthError = async (errorCode?: string) => {
    if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'AUTH_REQUIRED') {
      const shouldRelogin = confirm(
        '인증이 만료되었습니다.\n다시 로그인하시겠습니까?'
      );

      if (shouldRelogin) {
        await signOut({ redirect: false });
        await signIn('google');
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!session) return;

      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/leaderboard');
        const result = await response.json();

        if (!response.ok) {
          if (await handleAuthError(result.code)) {
            return;
          }
          throw new Error(result.error || '데이터를 불러올 수 없습니다.');
        }

        if (result.success) {
          setData(result.data);
        } else {
          throw new Error(result.error || '알 수 없는 오류가 발생했습니다.');
        }
      } catch (err) {
        console.error('리더보드 에러:', err);
        setError(err instanceof Error ? err.message : '데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [session]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 flex-1 flex flex-col">
        <h2 className="text-lg font-bold text-gray-900 mb-4">🏆 리더보드</h2>
        <div className="flex justify-center items-center flex-1">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 flex-1 flex flex-col">
        <h2 className="text-lg font-bold text-gray-900 mb-4">🏆 리더보드</h2>
        <div className="text-red-500 text-sm p-3 bg-red-50 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 flex-1 flex flex-col">
        <h2 className="text-lg font-bold text-gray-900 mb-4">🏆 리더보드</h2>
        <p className="text-gray-500 text-center flex-1 flex items-center justify-center">
          리더보드 데이터가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 flex-1 flex flex-col min-h-0">
      <h2 className="text-lg font-bold text-gray-900 mb-4">🏆 리더보드</h2>
      <div className="space-y-2 overflow-y-auto flex-1">
        {data.map((item, index) => (
          <div
            key={`${item.sheetName}-${index}`}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {item.title || '(제목 없음)'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {item.artist || '(아티스트 없음)'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
