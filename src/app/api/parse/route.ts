import { NextResponse } from 'next/server';
import { youtube } from '@googleapis/youtube';
import { sheets } from '@googleapis/sheets';
import { getServerSession } from 'next-auth';
import { OAuth2Client } from 'google-auth-library';
import { authOptions } from '../auth/auth.config';

// API 키 확인
if (!process.env.GOOGLE_API_KEY) {
  console.error('GOOGLE_API_KEY가 설정되지 않았습니다.');
}

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
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
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

    const youtubeClient = youtube({
      version: 'v3',
      auth: oauth2Client
    });

    const sheetsClient = sheets({
      version: 'v4',
      auth: oauth2Client
    });

    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL이 제공되지 않았습니다.' }, { status: 400 });
    }

    console.log('처리 중인 URL:', url);
    
    // 유튜브 비디오 ID 추출
    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
    
    if (!videoId) {
      return NextResponse.json({ error: '유효하지 않은 유튜브 URL입니다.' }, { status: 400 });
    }

    console.log('추출된 비디오 ID:', videoId);

    try {
      // 유튜브 API로 비디오 정보 가져오기
      const response = await youtubeClient.videos.list({
        part: ['snippet'],
        id: [videoId],
      });

      console.log('유튜브 API 응답:', JSON.stringify(response.data, null, 2));

      const video = response.data.items?.[0];
      if (!video) {
        return NextResponse.json({ error: '비디오를 찾을 수 없습니다.' }, { status: 404 });
      }

      const title = video.snippet?.title || '';
      const channelTitle = video.snippet?.channelTitle || '';

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
            range: '선곡!B3:E3',
            valueInputOption: 'RAW',
            requestBody: {
              values: [['선곡자', '아티스트', '곡명', '유튜브 링크']],
            },
          });
        }

        // 현재 시트의 모든 데이터 가져오기
        const currentData = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: '선곡!B:E',  // B-E열 검사
        });

        const values = currentData.data.values || [];
        let targetRow = 3;  // 기본적으로 3행부터 시작

        // 빈 행 찾기
        for (let i = 3; i < values.length + 1; i++) {
          if (!values[i] || !values[i][0]) {  // B열이 비어있는 행 찾기
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
          range: `선곡!B${targetRow}:E${targetRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[
              userName,  // 매핑된 이름 또는 이메일 아이디 사용
              channelTitle,
              title,
              `=HYPERLINK("${url}"; "URL")`
            ]],
          },
        });

        console.log('구글 시트 API 응답:', JSON.stringify(sheetResponse.data, null, 2));

        return NextResponse.json({
          success: true,
          data: {
            title,
            channelTitle,
            url,
            userName
          },
        });
      } catch (sheetError: any) {
        console.error('구글 시트 API 에러:', sheetError);
        return NextResponse.json({
          error: `구글 시트 API 에러: ${sheetError.message || '알 수 없는 에러'}`,
          details: sheetError.response?.data || sheetError
        }, { status: 500 });
      }
    } catch (youtubeError: any) {
      console.error('유튜브 API 에러:', youtubeError);
      return NextResponse.json({
        error: `유튜브 API 에러: ${youtubeError.message || '알 수 없는 에러'}`,
        details: youtubeError.response?.data || youtubeError
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