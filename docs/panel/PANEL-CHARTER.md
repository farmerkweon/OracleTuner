# 소프트웨어공학 패널 헌장 — OracleTuner 개선 라운드

작성 2026-07-30 · 총괄(Claude)

## 패널 구성

| 코드 | 역할 | 담당 판단 | 에이전트 매핑 |
|---|---|---|---|
| P-ARCH | 아키텍트 (McConnell 계열) | 모듈 경계·추상화·확장성. #4 저장소 전환 설계 최종안 | `architect` |
| P-CRIT | 비평가 | 설계 반박·리스크·클래식 미스테이크 검출 | `critic` |
| P-SEC | 보안/권한 | Program Files 쓰기권한, 접속정보 암호 저장, 포트 바인딩 | `security-reviewer` |
| P-QA | 검증 | 회귀 테스트 적합성, npm test 140건 유지 | `verifier` / `test-engineer` |
| P-REV | 코드리뷰 | SOLID·중복·명명, 슬라이스별 승인 | `code-reviewer` |
| **P-UI (한명수)** | UI/UX 감수 | 3·7·9·11 항목의 시각적 결과 감수. 여백·위계·모션·색 대비 | `designer` |

## 규율

- **저작(執筆) 레인과 심사(審査) 레인을 분리한다.** 구현한 에이전트가 자기 작업을 승인하지 않는다.
  구현 = `executor`, 승인 = `code-reviewer`/`verifier` (별개 컨텍스트).
- 패널 산출물은 전부 `docs/panel/` 에 파일로 남긴다. 구두 보고는 3줄 요약만.
- 설계 결정은 **근거(Why)** 를 반드시 문서에 기록한다. 결정 로그: `docs/panel/DECISIONS.md`

## OOP 리팩토링 원칙 (이번 라운드 적용 범위)

기능 수정과 리팩토링을 **같은 커밋에 섞지 않는다.** 순서:
`(a) 구조 문서화(UML) → (b) 리팩토링(동작 불변, 테스트 통과) → (c) 기능 수정`

적용 대상 (정찰 결과로 확정):
1. **뷰 계층** — 뷰 모듈들이 동일 생명주기(mount/render/destroy/i18n 재적용)를 중복 구현하고 있다면
   `BaseView` 추상 클래스로 추출. 이벤트 해제 누락(메모리 릭) 동시 해결.
2. **저장소 계층** — `tuning-store`/`snippet-store`/`connections` 의 파일 I/O를
   `Repository` 인터페이스 뒤로 숨기고 `JsonFileRepository` / `SqliteRepository` 구현 교체 가능하게.
   → 항목 #4의 전제. 인터페이스 없이 DB로 직행하면 롤백 불가.
3. **그리드** — 서브그리드/확대팝업(#8,#9)이 그리드 내부를 파고들지 않도록
   `GridView` 의 공개 API로만 조작.

## 안전선 (절대 양보 금지)

- `npm test` 140건이 깨진 상태로 커밋하지 않는다.
- 사용자 데이터(`data/tunings`, `config/connections.json`)를 **마이그레이션 없이** 포맷 변경하지 않는다.
  #4 전환 시 반드시 (a) 자동 백업 (b) 기존 파일 읽어 DB로 이관 (c) 실패 시 파일 모드 폴백.
- 오프라인 VDI 대상이므로 **새 npm 런타임 의존성 추가 금지**. Node 내장 모듈만 사용
  (`node:sqlite` 는 Node 22+ 내장 → 현재 v24.15.0 이므로 사용 가능성 있음. 정찰로 확인).
