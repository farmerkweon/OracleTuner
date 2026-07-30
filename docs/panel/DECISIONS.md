# 설계 결정 로그 (Decision Log)

## D-001 · 저장소 백엔드 = `node:sqlite` (내장 SQLite)  [항목 #4]

- **일시**: 2026-07-30 19:3x
- **결정**: 파일 기반 JSON 저장소를 SQLite 로 전환한다. 드라이버는 Node **내장 모듈 `node:sqlite`**.
- **실측 근거** (총괄이 직접 실행):
  ```
  node -v                          → v24.15.0
  require('node:sqlite') + CREATE/INSERT/SELECT  → OK
  ```
- **왜 이것인가** (발주자 제약 3개를 모두 만족하는 유일 후보):
  | 발주자 제약 | node:sqlite 판정 |
  |---|---|
  | "용량을 너무 차지하면 안 됨 (억세스DB처럼 작은 거)" | **추가 용량 0 B.** node.exe 바이너리에 이미 포함. npm 패키지·네이티브 빌드 불필요 |
  | "윈도우 전용이면 그냥 XML이 나음" | **크로스플랫폼.** Node 가 도는 모든 OS 에서 동일 동작 → XML 유지 조건 해당 없음 |
  | 오프라인 VDI (네트워크 설치 불가) | **네트워크 불필요.** `npm install` 도, 컴파일러도, VC++ 재배포도 필요 없음 |
- **탈락 후보와 이유**:
  - `better-sqlite3` — 네이티브 애드온. prebuilt 다운로드 필요 → 오프라인 VDI 위반. node-gyp 빌드 요구 위험.
  - MS Access(.mdb/.accdb) — 윈도우 전용 + ACE OLEDB 드라이버 별도 설치 필요. 발주자 기준상 XML보다 못함.
  - XML 유지 — 인덱스·정렬·부분갱신이 전량 재작성이라 튜닝 이력이 늘면 느려진다. 전환 이유 자체를 못 없앰.
- **⚠ 검증 필요 (P-QA 숙제)**: 포터블 배포판이 **어떤 node 버전을 번들하는지**.
  번들 node 가 22 미만이면 `node:sqlite` 가 없어 런타임에 죽는다.
  → 정찰 R5 결과 확인 후, 필요 시 번들 node 를 24.x 로 올리거나 `--experimental-sqlite` 플래그 검토.
- **롤백 안전선**: `Repository` 인터페이스를 먼저 도입하고 `JsonFileRepository`(현행) 를 그대로 남긴다.
  SQLite 초기화 실패 시 자동으로 파일 모드로 폴백. 기존 `data/tunings/*.json` 은 이관 전 무조건 백업.

---

## D-002 · (예약) 인스톨러 기술 선정  [항목 #6]
정찰 R5 의 `makensis`/`iscc` 설치 여부 확인 결과 대기 중.

## D-003 · (예약) 뷰 계층 OOP 리팩토링 범위  [OOP]
정찰 R3 의 "뷰 공통 규약" 결과 대기 중.
