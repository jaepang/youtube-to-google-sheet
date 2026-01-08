# 유튜브 음악 정보 수집기

유튜브 음악 영상의 정보를 자동으로 구글 시트에 저장하는 웹 애플리케이션입니다.

## 주요 기능

- Google 계정으로 로그인
- 유튜브 URL 입력을 통한 음악 정보 수집
- 수집된 정보(아티스트, 곡명)를 구글 시트에 자동 저장

## 기술 스택

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- NextAuth.js
- Google Sheets API
- YouTube Data API

## 개발 환경 설정

1. 저장소 클론
```bash
git clone [repository-url]
cd youtube-to-google-sheet
```

2. 의존성 설치
```bash
pnpm install
```

3. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 변수들을 설정합니다:
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
SHEETS_ID=your_google_sheets_id
```

4. 개발 서버 실행
```bash
pnpm dev
```

## 사용 방법

1. 애플리케이션에 접속하여 Google 계정으로 로그인합니다.
2. 유튜브 음악 영상의 URL을 입력합니다.
3. "구글 시트에 추가" 버튼을 클릭합니다.
4. 수집된 정보가 자동으로 구글 시트에 저장됩니다.

## 주의사항

- Google API 사용을 위해 필요한 API 키와 OAuth 2.0 클라이언트 ID를 발급받아야 합니다.
- 구글 시트의 ID를 환경 변수에 설정해야 합니다.
- YouTube Data API의 일일 할당량에 주의해야 합니다.

## 라이선스

MIT
