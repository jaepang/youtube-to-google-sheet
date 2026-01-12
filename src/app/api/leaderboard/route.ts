import { NextResponse } from 'next/server';
import { sheets } from '@googleapis/sheets';
import { getServerSession } from 'next-auth';
import { OAuth2Client } from 'google-auth-library';
import { authOptions } from '../auth/auth.config';

// 이메일-이름 매핑 파싱 함수
function getEmailToNameMapping(): Record<string, string> {
  try {
    const mappingStr = process.env.EMAIL_TO_NAME_MAPPING;
    console.log(mappingStr);
    if (!mappingStr) return {};
    return JSON.parse(mappingStr);
  } catch (error) {
    console.error('이메일-이름 매핑 파싱 에러:', error);
    return {};
  }
}

// 컬럼 인덱스 상수 (C부터 시작하므로 C=0)
const COL_ARTIST = 0;      // C
const COL_TITLE = 1;       // D
const COL_YOUTUBE = 2;     // E
const COL_RATING_START = 19; // V (V는 22번째 컬럼, C는 3번째, 22-3=19)
const COL_ORIGINAL_ROW = 28; // AE (AE는 31번째 컬럼, 31-3=28)

// HYPERLINK 수식에서 URL 추출
function extractUrlFromHyperlink(cellData: { hyperlink?: string | null; formula?: string | null; formattedValue?: string | null }): string {
  // 1. hyperlink 필드가 있으면 그대로 사용
  if (cellData.hyperlink) {
    return cellData.hyperlink;
  }
  
  // 2. formula가 HYPERLINK 수식이면 URL 추출
  const formula = cellData.formula || '';
  // =HYPERLINK("URL"; "텍스트") 또는 =HYPERLINK("URL", "텍스트") 형식
  const match = formula.match(/=HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  if (match) {
    return match[1];
  }
  
  // 3. formattedValue가 URL처럼 보이면 사용
  const text = cellData.formattedValue || '';
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return text;
  }
  
  return '';
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({
        error: '인증이 필요합니다.',
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }

    if (session.error === 'RefreshAccessTokenError' || session.error === 'NoRefreshToken') {
      return NextResponse.json({
        error: '인증이 만료되었습니다. 다시 로그인해주세요.',
        code: 'TOKEN_EXPIRED'
      }, { status: 401 });
    }

    // 현재 사용자 이름 가져오기
    const userEmail = session.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: '사용자 이메일을 찾을 수 없습니다.' }, { status: 400 });
    }
    const emailToNameMapping = getEmailToNameMapping();
    const userName = emailToNameMapping[userEmail] || userEmail.split('@')[0];

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: session.accessToken
    });

    const sheetsClient = sheets({
      version: 'v4',
      auth: oauth2Client
    });

    try {
      // 스프레드시트의 모든 시트 정보 가져오기
      const spreadsheet = await sheetsClient.spreadsheets.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
      });

      // "Leaderboard"가 포함된 시트 찾기
      const leaderboardSheets = spreadsheet.data.sheets?.filter(
        (sheet) => sheet.properties?.title?.includes('Leaderboard')
      ) || [];

      if (leaderboardSheets.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          message: 'Leaderboard 시트를 찾을 수 없습니다.'
        });
      }

      // 모든 Leaderboard 시트에서 C:AE 컬럼 데이터 수집
      const allData: { 
        artist: string; 
        title: string; 
        youtubeUrl: string; 
        rating: string;
        originalRow: number;
        sheetName: string;
      }[] = [];

      for (const sheet of leaderboardSheets) {
        const sheetTitle = sheet.properties?.title;
        if (!sheetTitle) continue;

        // formattedValue + userEnteredValue(수식) + hyperlink 가져오기
        const response = await sheetsClient.spreadsheets.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          ranges: [`${sheetTitle}!C:AE`],
          fields: 'sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue)',
        });

        const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData || [];
        
        // 1행(index 0)에서 사용자 컬럼 인덱스 찾기
        const headerRow = rowData[0]?.values || [];
        let userColumnIndex = -1;
        
        for (let i = COL_RATING_START; i < headerRow.length; i++) {
          const headerValue = headerRow[i]?.formattedValue || '';
          if (headerValue === userName) {
            userColumnIndex = i;
            break;
          }
        }
        console.log(userColumnIndex);

        // 첫 번째 행은 헤더이므로 스킵하고 데이터 추출
        for (let i = 1; i < rowData.length; i++) {
          const row = rowData[i];
          const values = row.values || [];
          
          const artist = values[COL_ARTIST]?.formattedValue || '';
          const title = values[COL_TITLE]?.formattedValue || '';
          
          // E 컬럼에서 YouTube URL 추출
          const youtubeCell = values[COL_YOUTUBE];
          // 디버깅
          if (i === 1) {
            console.log('E컬럼 전체:', JSON.stringify(youtubeCell, null, 2));
          }
          const youtubeUrl = extractUrlFromHyperlink({
            hyperlink: youtubeCell?.hyperlink,
            formula: youtubeCell?.userEnteredValue?.formulaValue,
            formattedValue: youtubeCell?.formattedValue,
          });
          
          // 사용자의 평가 값 (컬럼을 찾았을 경우에만)
          const rating = userColumnIndex >= 0 
            ? (values[userColumnIndex]?.formattedValue || '') 
            : '';
          
          // 원본 행 번호 (AE 컬럼)
          const originalRowStr = values[COL_ORIGINAL_ROW]?.formattedValue || '';
          const originalRow = parseInt(originalRowStr, 10) || 0;

          if (artist || title) {
            allData.push({
              artist,
              title,
              youtubeUrl,
              rating,
              originalRow,
              sheetName: sheetTitle,
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: allData,
        playlistId: process.env.YOUTUBE_PLAYLIST_ID || null,
      });
    } catch (sheetError: unknown) {
      console.error('구글 시트 API 에러:', sheetError);

      const error = sheetError as { code?: number; response?: { status?: number; data?: unknown }; message?: string };
      const statusCode = error.code || error.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        return NextResponse.json({
          error: '인증이 만료되었습니다. 다시 로그인해주세요.',
          code: 'TOKEN_EXPIRED',
          details: error.message
        }, { status: 401 });
      }

      return NextResponse.json({
        error: `구글 시트 API 에러: ${error.message || '알 수 없는 에러'}`,
        details: error.response?.data || sheetError
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error('일반 에러:', error);
    const err = error as { message?: string };
    return NextResponse.json({
      error: '서버 오류가 발생했습니다.',
      message: err.message || '알 수 없는 에러',
      details: error
    }, { status: 500 });
  }
}
