import { NextResponse } from 'next/server';
import { sheets } from '@googleapis/sheets';
import { getServerSession } from 'next-auth';
import { OAuth2Client } from 'google-auth-library';
import { authOptions } from '../auth/auth.config';
import { syncPlaylist } from '../sync-playlist/sync';

// API 키 확인
if (!process.env.SPREADSHEET_ID) {
  console.error('SPREADSHEET_ID가 설정되지 않았습니다.');
}

// 이메일-이름 매핑 파싱 함수
function getEmailToNameMapping(): Record<string, string> {
  try {
    const mappingStr = process.env.EMAIL_TO_NAME_MAPPING;
    if (!mappingStr) return {};
    return JSON.parse(mappingStr);
  } catch (error) {
    console.error('이메일-이름 매핑 파싱 에러:', error);
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({
        error: '인증이 필요합니다.',
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }

    // Check for token refresh errors
    if (session.error === 'RefreshAccessTokenError' || session.error === 'NoRefreshToken') {
      return NextResponse.json({
        error: '인증이 만료되었습니다. 다시 로그인해주세요.',
        code: 'TOKEN_EXPIRED'
      }, { status: 401 });
    }

    // 로그인한 사용자의 이메일에서 아이디만 추출
    const userEmail = session.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: '사용자 이메일을 찾을 수 없습니다.' }, { status: 400 });
    }

    // 이메일-이름 매핑에서 이름 찾기
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

    const { artist, title, url } = await request.json();
    
    if (!artist || !title || !url) {
      return NextResponse.json({ error: '아티스트, 곡명, URL이 모두 필요합니다.' }, { status: 400 });
    }

    try {
      // 스프레드시트 정보 가져오기
      const spreadsheet = await sheetsClient.spreadsheets.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
      });

      // 시트 존재 여부 확인
      const sheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === '선곡'
      );

      if (!sheet) {
        // 시트가 없으면 새로 생성
        await sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId: process.env.SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: '선곡',
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: 4,
                    },
                  },
                },
              },
            ],
          },
        });

        // 헤더 추가 (3행에 추가)
        await sheetsClient.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: '선곡!A3:D3',
          valueInputOption: 'RAW',
          requestBody: {
            values: [['선곡자', '아티스트', '곡명', '유튜브 링크']],
          },
        });
      }

      // 현재 시트의 모든 데이터 가져오기
      const currentData = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: '선곡!A:D',  // A-D열 검사
      });

      const values = currentData.data.values || [];
      let targetRow = 3;  // 기본적으로 3행부터 시작

      // 빈 행 찾기
      for (let i = 3; i < values.length + 1; i++) {
        if (!values[i] || !values[i][0]) {  // A열이 비어있는 행 찾기
          targetRow = i + 1;  // 1-based index로 변환
          break;
        }
        // 마지막 행까지 데이터가 있으면 다음 행에 추가
        if (i === values.length) {
          targetRow = values.length + 1;
        }
      }

      // 특정 행에 데이터 추가
      const sheetResponse = await sheetsClient.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `선곡!A${targetRow}:D${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            userName,  // 매핑된 이름 또는 이메일 아이디 사용
            artist,
            title,
            `=HYPERLINK("${url}"; "URL")`
          ]],
        },
      });

      console.log('구글 시트 API 응답:', JSON.stringify(sheetResponse.data, null, 2));

      // 재생목록 동기화 (실패해도 시트 저장은 성공으로 처리)
      let playlistSyncResult = null;
      try {
        playlistSyncResult = await syncPlaylist(session.accessToken);
        if (playlistSyncResult.success) {
          console.log('재생목록 동기화 성공:', playlistSyncResult);
        } else {
          console.warn('재생목록 동기화 실패:', playlistSyncResult.error);
        }
      } catch (syncError) {
        console.warn('재생목록 동기화 에러:', syncError);
      }

      return NextResponse.json({
        success: true,
        data: {
          title,
          artist,
          url,
          userName,
          playlistSync: playlistSyncResult?.success ? playlistSyncResult : null,
        },
      });
    } catch (sheetError: any) {
      console.error('구글 시트 API 에러:', sheetError);

      // Check for authentication/authorization errors
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
