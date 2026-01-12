'use client';

import { useState } from 'react';
import { FaYoutube } from 'react-icons/fa';
import { signIn, signOut, useSession } from 'next-auth/react';
import EditModal from './EditModal';

interface Props {
  spreadsheetUrl: string;
}

interface ParsedData {
  artist: string;
  title: string;
  url: string;
}

export default function HomeClient({ spreadsheetUrl }: Props) {
  const { data: session } = useSession();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);

  // Handle token expiry errors
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

  // YouTube URL에서 정보 가져오기
  const handleFetch = async (e: React.FormEvent) => {
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
        // Handle token expiry
        if (await handleAuthError(data.code)) {
          return;
        }
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      }

      if (data.success) {
        setParsedData({
          artist: data.data.artist,
          title: data.data.title,
          url: data.data.url,
        });
        setIsModalOpen(true);
      } else {
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('에러 상세:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 편집된 정보를 시트에 저장
  const handleSave = async (editedData: { artist: string; title: string }) => {
    if (!parsedData) return;

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist: editedData.artist,
          title: editedData.title,
          url: parsedData.url,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle token expiry
        if (await handleAuthError(data.code)) {
          setIsModalOpen(false);
          setParsedData(null);
          return;
        }
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      }

      if (data.success) {
        alert(`구글 시트에 성공적으로 추가되었습니다!\n\n아티스트: ${editedData.artist}\n곡명: ${editedData.title}`);
        setIsModalOpen(false);
        setParsedData(null);
        setUrl('');
      } else {
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('에러 상세:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
      alert(`오류 발생:\n\n${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setParsedData(null);
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
            <form onSubmit={handleFetch} className="space-y-4">
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
                {loading ? '정보 가져오는 중...' : '정보 가져오기'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 편집 모달 */}
      {parsedData && (
        <EditModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSave={handleSave}
          initialData={parsedData}
          loading={saving}
        />
      )}
    </main>
  );
}
