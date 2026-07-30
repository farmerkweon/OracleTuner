# SPEC · 설치 위저드 v2 (재작성)

총괄 확정 · 2026-07-31 02:40. 발주자 지시: "installer 다시 만들어 / 라이선스는 그냥 영문 쓰고 /
언어는 시작할 때 먼저 선택"

---

## 확정된 단계 순서 (발주자 확정)

```
STEP 0  언어 선택          ← 먼저. 이걸 골라야 나머지를 읽을 수 있다
STEP 1  라이선스(영문 원문) + 동의 체크
STEP 2  설치 경로
STEP 3  Java (시스템 JDK / 내장 JRE)
STEP 4  포트 (자동 탐색 + 직접 입력 + 테스트)
STEP 5  요약 → 설치 → 완료
```

### ★ 이전 설계를 뒤집는다
v1 은 언어를 **제목줄 옆 드롭다운**에 두고 5단계를 유지했다. `UI-SPEC-installer-i18n.md` §1 도
"별도 STEP 0 은 클릭을 하나 더 강제한다"며 그 안을 권했다. **그 판단은 틀렸다.**
언어를 못 읽는 사용자는 첫 화면부터 막힌다 — 클릭 한 번보다 그게 훨씬 큰 마찰이다.
발주자가 직접 지적했다: "이게 시작할 때 언어는 먼저 선택해야 하잖아."

⇒ **STEP 0 을 신설**한다. 단 제목줄 드롭다운도 **함께 유지**한다(언어를 잘못 고른 뒤 되돌리는 탈출구).
   둘은 같은 상태를 공유하고 서로 동기화된다.

## 라이선스 (발주자 확정: "그냥 영문 쓰고")
- **MIT 영문 원문만** 표시한다. 번역·병기·요약 전부 **제거**한다.
- 본문은 리포 루트 `LICENSE` 파일에서 읽는다. 없으면 내장 상수 폴백.
- 읽기 전용 텍스트박스 + 스크롤. 그 아래 동의 체크박스.
- 체크 전에는 [다음] 비활성.
- 라이선스 화면의 **주변 UI 문구(제목·버튼·"동의합니다")는 선택한 언어**를 따른다. 본문만 영문.

---

## 재사용할 것 (다시 만들지 마라)

| 자산 | 상태 |
|---|---|
| `installer/lang.ps1` | ko/en/ja/zh 문자열 테이블 364행. **이미 커밋됨.** 그대로 쓴다 |
| `docs/panel/LANG-REVIEW-{ja,zh,en}.md` | 언어별 문안 검수 결과. **반영할 것** |
| `docs/panel/UI-SPEC-installer-i18n.md` | 컨트롤 폭 실측(TextRenderer). 클리핑 2건 조치 필요 |
| `docs/panel/ARCH-REVIEW-installer-i18n.md` | BOM·개행·키 교집합 실측 |
| `server/port-utils.js` | 포트 탐색. 위저드가 재구현 금지 |
| `server/config.js --discover-java` | JDK 탐색. 위저드가 재구현 금지 |
| `tools/build-installer.js` | `AppLaunched=cmd.exe /c ...` 이미 수정됨. **되돌리지 마라** |

## 반드시 피할 함정 (실제로 당한 것들)

1. **모든 이벤트 핸들러에 `.GetNewClosure()`.**
   빠지면 핸들러가 정의 프레임 밖에서 호출될 때 바깥 변수를 못 찾는다.
   실제 증상: 언어 콤보를 바꾸는 순간 `'null 배열에 대한 인덱스를 만들 수 없습니다'`
   (`$state` 가 null → `$state.LangCodes` 가 null → 인덱싱 실패).
   바깥 스코프 변수를 참조하는 **모든** 핸들러가 대상이다.

2. **SelfTest 는 실제 이벤트를 발화시켜야 한다.**
   v1 의 SelfTest 는 `$applyLanguage` 를 **직접 호출**해 32/32 통과했지만, 사용자는 오류를 봤다.
   GUI 는 이벤트 핸들러를 거치는데 그 경로를 테스트하지 않았기 때문이다.
   ⇒ `LangCombo.SelectedIndex = 1/2/3` 처럼 **속성을 바꿔 핸들러가 실제로 돌게** 하고,
     버튼도 `.PerformClick()` 으로 눌러 보라. 직접 호출 케이스만으로는 통과로 치지 않는다.

3. **`$script:` + `GetNewClosure` 조합.**
   클로저 안에서 `$script:X = ...` 로 대입하면 클로저 자신의 격리 스코프에 써서 최상위와 끊긴다.
   대입은 **함수로 감싸서** 하라(v1 의 `Set-CurrentLang` 방식이 옳았다 — 그 패턴을 가져와라).

4. **CJK 폰트.** 로케일별로 폰트를 지정하지 않으면 두부(□□□)가 난다.
   ko: Malgun Gothic / ja: Yu Gothic UI / zh: Microsoft YaHei UI / en: Segoe UI.
   (총괄 실측: 전부 설치돼 있음.) **라이선스 텍스트박스는 영문 전용이라 고정폭 영문 폰트로 둔다.**

5. **컨트롤 폭 클리핑** (UI-SPEC 실측):
   - `langLabel` 60 → **78px** (영어 "Language:" 가 62px)
   - `btnFindPort` 120 → **140px**, 오른쪽 `btnTestPort` 위치 재조정

6. **인코딩.** `lang.ps1` 은 CJK 포함. Windows PowerShell 5.1 에서 깨지지 않는 인코딩으로 저장할 것
   (ARCH-REVIEW 의 실측 결론을 따를 것).

---

## 설치 레이아웃 (D-002-a — 바꾸지 마라)
```
<설치폴더>\app\        server, web, shared, java\out, java\lib, package.json, LICENSE
<설치폴더>\runtime\    node.exe (+선택적 jre\)
<설치폴더>\version.json
<설치폴더>\uninstall.ps1, lang.ps1
%LOCALAPPDATA%\OracleTuner\   config, data, logs, oracletuner.db   ← 패치 불가침
```
- 위저드가 고른 **포트·Java·언어**는 `%LOCALAPPDATA%\OracleTuner\config\settings.json` 에 기록.
  언어는 `ui.locale` (server/config.js 의 기존 스키마 — 새로 만들지 마라).
- Program Files 를 고르면 관리자 권한 안내 + 데이터는 `%LOCALAPPDATA%` 라고 명시.

## uninstall.ps1
- 설치 시 고른 언어를 `version.json` 에서 읽어 그 언어로 말한다.
- **사용자 데이터(`%LOCALAPPDATA%\OracleTuner`)는 지우지 말고 물어본다.**

---

## 검증 (완료 조건)
1. `wizard.ps1 -SelfTest` — **이벤트 발화 테스트 포함**. 4개 언어 각각 전환 + 버튼 PerformClick.
2. `uninstall.ps1 -SelfTest` 통과.
3. `node tools/build-installer.js` 성공.
4. **실제 exe 를 띄워 화면 캡처** — STEP 0 에서 4개 언어를 실제로 바꿔 보고 각각 캡처.
   GUI 는 셸을 블로킹하므로 `Start-Process`(-Wait 금지) → 잠시 후 캡처 → `Stop-Process` 로 정리.
5. 확인 못 한 것을 완료로 적지 마라.
