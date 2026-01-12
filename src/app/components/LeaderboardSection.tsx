'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface LeaderboardItem {
  artist: string;
  title: string;
  youtubeUrl: string;
  rating: string;
  originalRow: number;
  sheetName: string;
}

// 평가 옵션 정의
const RATING_OPTIONS = [
  { value: '유잼', label: '유잼', bgClass: 'bg-green-100', textClass: 'text-green-700', hoverClass: 'hover:bg-green-200' },
  { value: '가능', label: '가능', bgClass: 'bg-yellow-100', textClass: 'text-yellow-700', hoverClass: 'hover:bg-yellow-200' },
  { value: '노잼', label: '노잼', bgClass: 'bg-red-100', textClass: 'text-red-700', hoverClass: 'hover:bg-red-200' },
  { value: '불가', label: '불가', bgClass: 'bg-red-600', textClass: 'text-red-100', hoverClass: 'hover:bg-red-700' },
  { value: '불참', label: '불참', bgClass: 'bg-gray-200', textClass: 'text-gray-900', hoverClass: 'hover:bg-gray-300' },
] as const;

// 평가 값에 따른 뱃지 스타일 반환
function getRatingStyle(rating: string) {
  const option = RATING_OPTIONS.find(opt => opt.value === rating);
  if (!option) return null;
  return { bgClass: option.bgClass, textClass: option.textClass };
}

// YouTube URL을 임베드 URL로 변환
function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  
  // watch?v= 형식
  const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }
  
  // 이미 embed 형식인 경우
  if (url.includes('youtube.com/embed/')) {
    return url;
  }
  
  return null;
}

export default function LeaderboardSection() {
  const { data: session } = useSession();
  const [data, setData] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState<LeaderboardItem | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingChanged, setRatingChanged] = useState(false);

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

  useEffect(() => {
    fetchLeaderboard();
  }, [session]);

  const handleItemClick = (item: LeaderboardItem) => {
    setSelectedItem(item);
  };

  const closeModal = () => {
    // 평가가 변경됐으면 리더보드 새로고침
    if (ratingChanged) {
      setRatingChanged(false);
      fetchLeaderboard();
    }
    setSelectedItem(null);
  };

  const handleRating = async (rating: string) => {
    if (!selectedItem || !selectedItem.originalRow) return;

    setRatingLoading(true);

    try {
      const response = await fetch('/api/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalRow: selectedItem.originalRow,
          rating,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (await handleAuthError(result.code)) {
          closeModal();
          return;
        }
        throw new Error(result.error || '평가 저장에 실패했습니다.');
      }

      if (result.success) {
        // 로컬 상태 업데이트
        setData(prev => prev.map(item => 
          item.originalRow === selectedItem.originalRow 
            ? { ...item, rating } 
            : item
        ));
        // 선택된 항목도 업데이트
        setSelectedItem(prev => prev ? { ...prev, rating } : null);
        // 평가 변경 플래그 설정
        setRatingChanged(true);
      }
    } catch (err) {
      console.error('평가 에러:', err);
      alert(err instanceof Error ? err.message : '평가 저장에 실패했습니다.');
    } finally {
      setRatingLoading(false);
    }
  };

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

  const embedUrl = selectedItem ? getYoutubeEmbedUrl(selectedItem.youtubeUrl) : null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 flex-1 flex flex-col min-h-0">
        <h2 className="text-lg font-bold text-gray-900 mb-4">🏆 리더보드</h2>
        <div className="space-y-2 overflow-y-auto flex-1">
          {data.map((item, index) => {
            const ratingStyle = getRatingStyle(item.rating);
            const isUnrated = !item.rating;
            
            return (
              <div
                key={`${item.sheetName}-${index}`}
                onClick={() => handleItemClick(item)}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                  isUnrated 
                    ? 'bg-amber-50 hover:bg-amber-100 border border-amber-200' 
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
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
                {ratingStyle && (
                  <span className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${ratingStyle.bgClass} ${ratingStyle.textClass}`}>
                    {item.rating}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* YouTube 임베드 모달 */}
      {selectedItem && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-900 truncate">{selectedItem.title}</h3>
                <p className="text-sm text-gray-500 truncate">{selectedItem.artist}</p>
              </div>
              <button
                onClick={closeModal}
                className="ml-4 p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <span className="text-xl text-gray-500">✕</span>
              </button>
            </div>
            <div className="aspect-video bg-black">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white">
                  유효하지 않은 YouTube URL입니다.
                </div>
              )}
            </div>
            
            {/* 평가 버튼 */}
            <div className="p-4 border-t">
              <div className="flex flex-wrap gap-2 justify-center">
                {RATING_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleRating(option.value)}
                    disabled={ratingLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${option.bgClass} ${option.textClass} ${option.hoverClass} ${
                      selectedItem.rating === option.value 
                        ? 'ring-2 ring-offset-2 ring-blue-500' 
                        : ''
                    } ${ratingLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {selectedItem.rating && (
                <p className="text-center text-sm text-gray-500 mt-3">
                  현재 평가: <span className="font-medium">{selectedItem.rating}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
