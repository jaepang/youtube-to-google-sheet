import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/auth.config';
import { syncPlaylist } from './sync';

export async function POST() {
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

    const result = await syncPlaylist(session.accessToken);

    if (!result.success) {
      return NextResponse.json({
        error: result.error,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.deleted,
        added: result.added,
        total: result.total,
      },
    });
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
