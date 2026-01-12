import { NextResponse } from 'next/server';
import { sheets } from '@googleapis/sheets';
import { getServerSession } from 'next-auth';
import { OAuth2Client } from 'google-auth-library';
import { authOptions } from '../auth/auth.config';

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
      console.log(spreadsheet.data.sheets);
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

      // 모든 Leaderboard 시트에서 C:D 컬럼 데이터 수집
      const allData: { artist: string; title: string; sheetName: string }[] = [];

      for (const sheet of leaderboardSheets) {
        const sheetTitle = sheet.properties?.title;
        if (!sheetTitle) continue;

        const response = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `${sheetTitle}!C:D`,
        });

        const rows = response.data.values || [];
        
        // 첫 번째 행은 헤더일 수 있으므로 스킵하고 데이터 추출
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row[0] || row[1]) {
            allData.push({
              artist: row[0] || '',
              title: row[1] || '',
              sheetName: sheetTitle,
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: allData,
      });
    } catch (sheetError: any) {
      console.error('구글 시트 API 에러:', sheetError);

      const statusCode = sheetError.code || sheetError.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        return NextResponse.json({
          error: '인증이 만료되었습니다. 다시 로그인해주세요.',
          code: 'TOKEN_EXPIRED',
          details: sheetError.message
        }, { status: 401 });
      }

      return NextResponse.json({
        error: `구글 시트 API 에러: ${sheetError.message || '알 수 없는 에러'}`,
        details: sheetError.response?.data || sheetError
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('일반 에러:', error);
    return NextResponse.json({
      error: '서버 오류가 발생했습니다.',
      message: error.message || '알 수 없는 에러',
      details: error
    }, { status: 500 });
  }
}
