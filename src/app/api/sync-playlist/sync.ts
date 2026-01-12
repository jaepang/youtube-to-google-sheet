import { sheets } from '@googleapis/sheets';
import { youtube } from '@googleapis/youtube';
import { OAuth2Client } from 'google-auth-library';

// YouTube URL에서 video ID 추출
function extractVideoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// HYPERLINK 수식에서 URL 추출
function extractUrlFromFormula(formula: string): string {
  if (!formula) return '';
  const match = formula.match(/=HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  return match ? match[1] : '';
}

export interface SyncResult {
  success: boolean;
  deleted?: number;
  added?: number;
  total?: number;
  error?: string;
}

export async function syncPlaylist(accessToken: string): Promise<SyncResult> {
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;
  if (!playlistId) {
    return { success: false, error: 'YOUTUBE_PLAYLIST_ID 환경변수가 설정되지 않았습니다.' };
  }

  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken
  });

  const sheetsClient = sheets({
    version: 'v4',
    auth: oauth2Client
  });

  const youtubeClient = youtube({
    version: 'v3',
    auth: oauth2Client
  });

  try {
    // 1. 선곡 시트에서 E 컬럼(YouTube URL) 전체 조회
    const sheetResponse = await sheetsClient.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      ranges: ['선곡!E:E'],
      fields: 'sheets.data.rowData.values(userEnteredValue)',
    });

    const rowData = sheetResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];
    
    // URL 목록 추출 (헤더 스킵)
    const videoIds: string[] = [];
    for (let i = 1; i < rowData.length; i++) {
      const cell = rowData[i]?.values?.[0];
      const formula = cell?.userEnteredValue?.formulaValue || '';
      const url = extractUrlFromFormula(formula);
      const videoId = extractVideoId(url);
      if (videoId) {
        videoIds.push(videoId);
      }
    }

    console.log(`동기화할 영상 수: ${videoIds.length}`);

    // 2. 재생목록 현재 항목 조회 및 삭제
    let nextPageToken: string | undefined;
    const itemsToDelete: string[] = [];

    do {
      const playlistResponse = await youtubeClient.playlistItems.list({
        part: ['id'],
        playlistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      const items = playlistResponse.data.items || [];
      for (const item of items) {
        if (item.id) {
          itemsToDelete.push(item.id);
        }
      }

      nextPageToken = playlistResponse.data.nextPageToken || undefined;
    } while (nextPageToken);

    console.log(`삭제할 기존 항목 수: ${itemsToDelete.length}`);

    // 3. 모든 항목 삭제
    for (const itemId of itemsToDelete) {
      await youtubeClient.playlistItems.delete({
        id: itemId,
      });
    }

    console.log('기존 항목 삭제 완료');

    // 4. 시트 곡 순서대로 추가
    let addedCount = 0;
    for (const videoId of videoIds) {
      try {
        await youtubeClient.playlistItems.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              playlistId,
              resourceId: {
                kind: 'youtube#video',
                videoId,
              },
            },
          },
        });
        addedCount++;
      } catch (insertError) {
        console.error(`영상 추가 실패 (${videoId}):`, insertError);
        // 개별 영상 실패는 무시하고 계속 진행
      }
    }

    console.log(`재생목록 동기화 완료: ${addedCount}개 추가`);

    return {
      success: true,
      deleted: itemsToDelete.length,
      added: addedCount,
      total: videoIds.length,
    };
  } catch (error) {
    console.error('재생목록 동기화 에러:', error);
    const err = error as { message?: string };
    return {
      success: false,
      error: err.message || '알 수 없는 에러',
    };
  }
}
