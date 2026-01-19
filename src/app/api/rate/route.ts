import { NextResponse } from 'next/server';
import { sheets } from '@googleapis/sheets';
import { getServerSession } from 'next-auth';
import { OAuth2Client } from 'google-auth-library';
import { authOptions } from '../auth/auth.config';

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

// 컬럼 인덱스를 A1 표기법으로 변환
function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// 유효한 평가 값
const VALID_RATINGS = ['유잼', '가능', '노잼', '불가', '불참', ''];

export async function POST(request: Request) {
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

    const { originalRow, rating } = await request.json();

    if (!originalRow || typeof originalRow !== 'number') {
      return NextResponse.json({ error: '원본 행 번호가 필요합니다.' }, { status: 400 });
    }

    if (!VALID_RATINGS.includes(rating)) {
      return NextResponse.json({ error: '유효하지 않은 평가입니다.' }, { status: 400 });
    }

    try {
      // 선곡 시트의 1행에서 사용자 컬럼 찾기
      const headerResponse = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: '선곡!U1:ZY1', // U부터 충분히 넓은 범위
      });

      const headerRow = headerResponse.data.values?.[0] || [];
      let userColumnOffset = -1;

      for (let i = 0; i < headerRow.length; i++) {
        if (headerRow[i] === userName) {
          userColumnOffset = i;
          break;
        }
      }

      if (userColumnOffset === -1) {
        return NextResponse.json({
          error: `사용자 컬럼을 찾을 수 없습니다: ${userName}`
        }, { status: 404 });
      }

      // U는 21번째 컬럼 (1-indexed), 0-indexed로는 20
      const userColumnIndex = 20 + userColumnOffset; // U(20) + offset
      const columnLetter = columnIndexToLetter(userColumnIndex);

      // 선곡 시트의 해당 행, 해당 컬럼에 평가 저장
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `선곡!${columnLetter}${originalRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[rating]],
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          originalRow,
          rating,
          column: columnLetter,
        },
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
