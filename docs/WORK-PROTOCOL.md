# OracleTuner 개선 작업 규약 (Anti-Crash Protocol)

작성: 2026-07-30 19:32:20 · 총괄(Claude) 확정

## 배경 — 왜 4번 다운됐는가

지난 4회 시도는 모두 **총괄이 대형 소스를 직접 컨텍스트에 적재**해서 죽었다.
이 리포의 소스 총량은 다음과 같다 (node_modules/dist 제외):

| 파일 | 크기 | 위험도 |
|---|---|---|
| server/candidates.js | 57 KB | ★★★ 총괄 직접 읽기 금지 |
| web/js/i18n.js | 46 KB | ★★★ 금지 |
| java/.../Exec.java | 45 KB | ★★★ 금지 |
| test/run-tests.js | 44 KB | ★★★ 금지 |
| web/js/views/workbench.js | 41 KB | ★★★ 금지 |
| web/js/views/help.js | 39 KB | ★★★ 금지 |
| web/css/app.css | 38 KB | ★★★ 금지 |
| server/analyzer.js | 40 KB | ★★★ 금지 |
| shared/sql-tokenizer.js | 35 KB | ★★★ 금지 |
| server/api.js | 35 KB | ★★★ 금지 |
| web/index.html | 30 KB | ★★☆ |

전량 합계 ≈ 700 KB ≈ 200k 토큰. 한 번에 담으면 반드시 죽는다.

## R-A. 총괄의 3대 금지

1. **20KB 초과 파일을 Read로 통째 읽지 않는다.** 반드시 `Grep`(좁은 패턴) 또는
   `Read offset/limit`(≤120행)만 쓴다.
2. **소스 본문을 답변에 붙여넣지 않는다.** 경로:행 참조만 쓴다.
3. **대량 수정은 총괄이 직접 하지 않는다.** executor 서브에이전트에 위임한다.
   총괄은 grep 1~2회로 결과만 검증한다.

## R-B. 작업 단위 = 슬라이스(Slice)

11개 요구를 **파일 소유권이 겹치지 않는 슬라이스**로 쪼갠다.
한 슬라이스 = 한 에이전트 = 1~3 파일. 동시 실행 시 같은 파일을 두 에이전트가
만지지 않게 총괄이 배차한다(파일 락 표: `docs/panel/file-ownership.md`).

## R-C. 로그 (전 프로젝트 공통 규약 준수)

- 포맷: `[YYYY-MM-DD HH:MM:SS] LEVEL COMPONENT 메시지`
- 위치: `E:\IBANK\SeTools\OracleTuner\logs\agent\<슬라이스ID>.log`
- **시각은 반드시 `Get-Date -Format 'yyyy-MM-dd HH:mm:ss'` 실행 결과를 쓴다.** 추정 금지.
- 에이전트 반환 텍스트는 3줄 이내. 본체는 디스크에.
- 총괄은 스폰 직후·완료 직후 파일 존재/행수를 직접 확인한다.

## R-D. 구조는 PlantUML로 먼저

각 슬라이스 착수 전 `docs/uml/<영역>.puml`에 현재 구조를 그린다.
UML이 있으면 소스를 다시 읽지 않고도 다음 세션이 이어받을 수 있다 → 토큰 절약 + 크래시 복구.

## R-E. 커밋 규율

- 슬라이스 1개 완료 = 커밋 1개 (atomic). `npm test` 통과 후 커밋.
- 커밋 전 반드시 `git status`로 의도한 파일만 스테이징됐는지 확인.
- 메모리(`~/.claude/projects/E--IBANK-SeTools/memory/`) 갱신도 슬라이스마다.

## R-F. 정지 감지

에이전트 heartbeat 15분 이상 정지 = 사망 판정. **자동 재시작하지 않고 중단**,
로그에서 원인 규명 후 패널 재소집.
