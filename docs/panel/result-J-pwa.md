# 결과 — J (항목 #14: 즐겨찾기 추가 버튼 + 앱 아이콘)

## 설계 결정
브라우저는 JS로 진짜 북마크 추가를 더는 허용하지 않는다(IE `window.external.AddFavorite` 폐지).
그래서 **PWA 설치**로 대체했다. `127.0.0.1`은 브라우저가 secure context로 인정해 설치가 실제로 동작한다.

## 변경 내역

### 1) 아이콘 (`web/icon.svg`, `web/icons/icon-192.png`, `web/icons/icon-512.png`)
- 상단바 브랜드 마크(파란 라운드 사각형 + 흰 "OT", `app.css:78-83` 참조)를 그대로 SVG로 재구성.
- PNG는 이미지 라이브러리 없이, 아이콘만 담은 임시 HTML을 정확한 크기(192/512)로 만들고
  헤드리스 크롬(`--headless=new --screenshot=...`)으로 촬영해 생성. 임시 HTML은 확인 후 삭제.
- 언어 무관이라 1벌만 만들었다. 배경은 투명이 아니라 앱 primary 색(#1976d2) — 스크린샷으로 육안 확인함.

### 2) manifest 4벌 (`web/manifest.{ko,en,ja,zh}.webmanifest`)
- `name`/`short_name`/`description`/`lang`을 언어별로. `display: standalone`, `theme_color`/`background_color`는
  `app.css`의 `--primary`(#1976d2)와 맞춤.
- 아이콘은 `purpose: "any maskable"`로 192/512 PNG 재사용(별도 maskable 이미지를 새로 안 만듦 — 아이콘이
  이미 중앙 정렬 + 여백을 두고 있어 마스크 크롭에 안전).
- `web/index.html`에 `<link rel="manifest" id="link-manifest">`을 두고, 기본값은 ko.
- `web/js/app.js`의 `initShell()`에서 `onLangChange` 리스너로 href를
  `/manifest.${code}.webmanifest`로 교체(단일 파일 규격이라 다국어를 한 파일에 못 담기 때문).

### 3) service worker (`web/sw.js`)
- Chrome 설치 프롬프트 조건(활성 SW) 충족용 + 폐쇄망 오프라인 캐시 이득.
- **network-first만 사용**(절대 cache-first 아님) — 패치가 잦은 앱이라 낡은 화면이 뜨는 걸 방지.
- `/api/*`는 캐시하지 않음(DB 상태를 담고 있어서). `SW_VERSION` 상수 + `activate`에서 구 캐시 삭제.

### 4) 버튼 + i18n
- `web/index.html`: `#btn-help` 바로 앞에 `#btn-install` 버튼 추가(기존 `btn btn-ghost` 클래스 재사용,
  새 CSS 파일 불필요 — `install.css` 안 만듦).
- `web/js/app.js`:
  - 모듈 최상단에 `beforeinstallprompt`(preventDefault + 보관)와 `appinstalled`(토스트) 리스너.
  - `registerServiceWorker()` 추가, `boot()`에서 호출.
  - `initShell()`에 설치 버튼 배선: 클릭 시 보관된 프롬프트로 `prompt()`, standalone이면 버튼 숨김,
    프롬프트가 없는 브라우저(Firefox/Safari 등)는 **기존 `toast()`**로 Ctrl+D 안내(새 모달 안 만듦 — `views/help.js`는
    소유 범위 밖이라 손대지 않았고, 커스텀 오버레이도 새로 만들지 않았음).
  - manifest 링크 언어 교체 로직도 `initShell()`에 배선.
- `web/js/i18n.js`: `top.install`, `top.installTip`, `install.doneToast`, `install.ctrlDHint` — ko/en/ja/zh 4개 전부.

### 5) 서버 (`server/index.js`)
- MIME 맵에 `.webmanifest` → `application/manifest+json; charset=utf-8` 한 줄 추가. 그 외 로직 무변경.

## 검증
- `npm test`: **통과 163 · 실패 0**(+ 진행률 슬라이스 4/4) — 작업 전후 건수 동일, 회귀 없음.
- 포트 7070에 이미 떠 있던 서버(다른 에이전트가 띄운 것으로 추정, pid 19628/npm pid 18724)를 MIME 변경
  반영을 위해 재기동(`npm start` 백그라운드). 재기동 후:
  - `/manifest.ko|en|ja|zh.webmanifest` → 200, `Content-Type: application/manifest+json; charset=utf-8`
  - `/sw.js` → 200, `text/javascript; charset=utf-8`
  - `/icon.svg` → 200, `image/svg+xml`
  - `/icons/icon-192.png`, `/icons/icon-512.png` → 200, `image/png`
- 헤드리스 크롬 스크린샷(`http://127.0.0.1:7070/`)으로 상단바에 "↓ 즐겨찾기 추가" 버튼과 favicon(OT 마크)이
  정상 노출되는 것을 육안 확인.
- CDP(Chrome DevTools Protocol, WebSocket, 추가 패키지 설치 없이 Node 내장 `fetch`/`WebSocket`만 사용)로
  실제 언어 전환을 트리거해 확인:
  - 기본(ko): `<link id="link-manifest">` href = `/manifest.ko.webmanifest`
  - `#sel-lang`을 `en`으로 바꾼 뒤: href = `/manifest.en.webmanifest` (정상 교체)
  - 설치 버튼 라벨이 "Add to Favorites"로 즉시 갱신됨(i18n 배선 정상)
- PNG 아이콘은 스크린샷으로 투명 배경이 아니라 앱 색(#1976d2) 배경인 것을 눈으로 확인.
- 임시 하네스(아이콘 생성용 HTML, CDP 확인 스크립트, 크롬 프로필 디렉터리)는 모두 scratchpad에서만
  작업했고 작업 완료 후 삭제함. 저장소(`web/`)에는 최종 산출물만 남음.

### 정직한 한계
- **PWA 설치 프롬프트(`beforeinstallprompt` → 실제 설치 완료까지의 흐름)는 사용자 조작이 필요해
  수동으로 직접 클릭·설치까지는 확인하지 못했다.** `beforeinstallprompt` 리스너 등록, 버튼 클릭 시
  `prompt()` 호출, `appinstalled` 토스트 로직은 코드 레벨로는 정확하나, 실제 브라우저 설치 UI가
  뜨는지·설치 후 바로가기가 실제로 생기는지는 자동화 검증 범위 밖이었다.
- Ctrl+D 안내 토스트도 마찬가지로 "설치 미지원 브라우저"를 실제로 재현해 클릭까지 확인하지는 않았고,
  코드 경로(`deferredInstallPrompt`가 null일 때 toast 호출)만 확인했다.

## 배타 소유 파일 외 변경 여부
`web/css/app.css`, `web/js/views/**`, `server/config.js`, `server/paths.js`, `tools/**`, `installer/**`,
`java/**`, `test/run-tests.js`는 건드리지 않음. 커밋 시 다른 에이전트의 미커밋 산출물
(`STATUS.md`, `design/capture-help-shots.js`, `web/help-img/`)도 `git add -A`를 쓰지 않아 그대로 두었다.

## 커밋
1. `1237dd6` feat(pwa): 앱 아이콘(SVG/PNG)과 언어별 PWA manifest 4벌 추가
2. `7cbbd73` feat(pwa): 최소 service worker 추가
3. `406aa70` feat(pwa): 상단바에 즐겨찾기 추가(PWA 설치) 버튼과 4개 언어 문구 추가
4. `59d9eb2` feat(server): .webmanifest MIME 타입 추가
