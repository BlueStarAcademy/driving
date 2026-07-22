# DRIVING — 한국 도로 운전 연습 PWA

단일 Next.js 앱(App Router) + Prisma/Postgres + React Three Fiber.

## 로컬 실행

1. Postgres 준비 후 `.env` 작성 (`.env.example` 참고)
2. 설치·마이그레이션·시드

```bash
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

3. http://localhost:3000 — 로그인 → 닉네임 → 차고 → 내비 → 운전

슈퍼마스터: `admin@driving.com` / `123456` (환경변수로 변경 가능)

## 라우트

| 경로 | 설명 |
|------|------|
| `/` | 로그인·회원가입 |
| `/onboarding` | 닉네임 |
| `/garage` | 차량·오토/수동 |
| `/nav` | 출발/도착·빠른 시작 |
| `/drive` | 1인칭 운전 HUD |
| `/admin` | 유저 목록·정지 (슈퍼마스터) |

## Railway

1. 이 저장소를 **웹 서비스 하나**로 연결 (루트 `Dockerfile` / `railway.toml` 사용; 구 `server`/`admin` 폐기)
2. Postgres 플러그인 추가 → `DATABASE_URL` 주입
3. 환경변수: `JWT_SECRET`, `SUPER_MASTER_EMAIL`, `SUPER_MASTER_PASSWORD`
4. 배포 시 엔트리포인트가 `prisma migrate deploy` + 시드 후 `next start`

프로덕션(재연결 후): https://driving-production-bf13.up.railway.app

구 admin 서비스(`admin-production-2007`)는 더 이상 필요하지 않습니다. 대시보드는 앱의 `/admin`을 사용하세요.

## PWA

`manifest.webmanifest` + `/sw.js` 오프라인 셸. 모바일 Chrome에서 홈 화면 추가 후 가로 HUD를 권장합니다.
