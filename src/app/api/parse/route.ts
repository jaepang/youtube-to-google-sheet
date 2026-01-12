import { NextResponse } from 'next/server';
import { youtube } from '@googleapis/youtube';
import { getServerSession } from 'next-auth';
import { OAuth2Client } from 'google-auth-library';
import { authOptions } from '../auth/auth.config';

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

      return NextResponse.json({
        success: true,
        data: {
          title,
          artist: channelTitle,
          url,
        },
      });
    } catch (youtubeError: any) {
      console.error('유튜브 API 에러:', youtubeError);

      // Check for authentication/authorization errors
      const statusCode = youtubeError.code || youtubeError.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        return NextResponse.json({
          error: '인증이 만료되었습니다. 다시 로그인해주세요.',
          code: 'TOKEN_EXPIRED',
          details: youtubeError.message
        }, { status: 401 });
      }

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
