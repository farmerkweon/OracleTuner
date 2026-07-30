# UI-SPEC: 설치 위저드 4개 국어(ko/en/ja/zh) — WinForms 레이아웃 규격

- 작성: P-UI (한명수 레인)
- 대상 파일(읽기 전용 참조, 수정 금지): `installer/wizard.ps1`(642줄), `installer/lang.ps1`
- 검증 방법: `[System.Windows.Forms.TextRenderer]::MeasureText()` 실측(측정 스크립트 결과를 아래 표에 그대로 반영). 실측하지 못한 값은 "추정"이라고 표기.
- 전제: 이 문서 작성 시점에 `installer/wizard.ps1`·`installer/lang.ps1` 은 **이미 4개 국어 구현이 상당히 진행되어 있었다**(언어 콤보박스, 로케일 폰트 매핑, 4로케일 문자열 테이블, 라이선스 원문 병기 로직 모두 존재). 이 문서는 처음부터 설계를 제안하는 문서가 아니라, **구현된 설계를 검증하고, 실측으로 드러난 클리핑 위험과 접근성 공백을 짚어 확정 규격으로 남기는 문서**다.

---

## 1. 언어 선택 UI — 위치와 근거

**선택: (c) 제목줄 옆 드롭다운 — 이미 그렇게 구현되어 있음(확인함).**

- 위치: `titleLabel` 오른쪽, 폼 상단 고정 행. `langLabel`(Point 425,21 / Size 60×20, 우측 정렬) + `langCombo`(Point 490,18 / Size 95×24, `DropDownList` 스타일).
- **5단계 전체에서 항상 보이는 위치**다(STEP 패널이 아니라 `$form.Controls`에 바로 얹혀 있어 단계 전환과 무관하게 고정).
- 기본값: `Get-DefaultLanguage`가 `(Get-Culture).TwoLetterISOLanguageName`을 읽어 ko/ja/zh 중 하나면 그 값, 아니면 en.
- 언어를 바꾸면 `$applyLanguage`가 폼을 다시 만들지 않고 이미 그려진 모든 컨트롤의 `.Text`/`.Font`를 즉시 재대입한다(리렌더 없이 in-place 갱신).

**이 선택이 맞는 이유**
1. 별도 STEP 0 화면(안이 b)은 "설치를 시작하기 전에 한 번 더 클릭"을 강제한다. 위저드는 5단계나 되므로 진입 마찰을 하나 더 얹지 않는 편이 낫다.
2. STEP 1 상단 콤보(안 a)는 라이선스 동의라는 STEP 1의 핵심 과업과 시각적으로 경쟁한다. 또한 STEP 2~5로 넘어가면 사라지므로 "이 화면 이해가 안 되는데 언어를 못 바꾼다"는 사고가 재발할 수 있다.
3. 제목줄 옆 고정 위치(c)는 항상 보이고, 항상 같은 자리에 있어 "언어가 이상하면 오른쪽 위를 보면 된다"는 예측 가능성을 준다. OS 언어 자동 추정과 결합하면 대부분의 사용자는 콤보를 건드릴 필요조차 없다 — 즉 이 컨트롤의 존재 자체가 "혹시 잘못 추정됐을 때의 탈출구"로 기능하면 충분하다.

**실측 기반 폭 위험 — 조치 필요**

| 컨트롤 | 현재 폭 | 실측 최대(NoPadding) | 결과 |
|---|---|---|---|
| `langLabel` ("Language:") | 60px | **62px** (en, 맑은 고딕 9pt) | ❌ 2px 초과. 우측 정렬 텍스트라 잘리면 "Language" 끝 글자가 눌린다 |
| `langCombo` 드롭다운 항목 (English/한국어/日本語/中文) | 95px (화살표·패딩 제외 실사용 폭 약 70~74px) | 최대 49px (English, zh 폰트 기준) | ✅ 여유 있음 |

**조치 지시(수치만 — 코드는 다른 에이전트가 반영):** `langLabel.Size`를 `New-Object System.Drawing.Size(78, 20)`로, `langCombo.Location.X`를 그만큼(현재 490 → 508 부근) 오른쪽으로 밀 것. 폼 폭(620)에 여유가 있으므로 `langCombo` 오른쪽 끝이 폼을 벗어나지 않는지만 재확인.

---

## 2. 라이선스 화면(STEP 1) 레이아웃

이미 구현된 배치(그대로 유지 권장):

```
panel1 (565×320, bodyPanel 안)
├─ introLabel      (0,0)   560×40   — "이 소프트웨어를 설치합니다. MIT 라이선스에 동의하세요" 류 안내
├─ licenseBox      (0,45)  560×220  — TextBox, Multiline, ReadOnly, ScrollBars=Vertical
│    내용 = [로케일 요약(license.summary)]
│          + [정본 고지(license.authoritativeNote, ⚠ 접두)]
│          + 구분선("----...")
│          + [영문 MIT 원문 — LICENSE 파일 또는 폴백]
└─ chkAccept       (0,275) 400×24   — "라이선스 조건에 동의합니다."
```

- **원문이 정본이라는 원칙**은 이미 문자열 레벨에서 지켜지고 있다: `license.authoritativeNote`가 4개 언어 모두 "아래 영문 원문이 정본"이라는 취지를 명시하고, `Build-LicenseDisplayText`가 로케일 요약 → 정본 고지 → 구분선 → 영문 원문 순으로 한 텍스트박스에 이어 붙인다. 번역·원문을 별도 탭이나 토글로 나누지 않고 **스크롤 한 번으로 다 보이게** 한 것은 옳은 선택이다 — 위저드에서 탭 컨트롤은 과설계다.
- 스크롤 영역: 220px 높이면 로케일 요약(2~4줄) + 고지문(1~2줄) + 구분선 + MIT 원문(약 25줄, 서드파티 표기 포함)이 전부 들어가지 않는다. **의도적으로 스크롤이 전제된 설계**이며, 이는 타당하다(라이선스 전문을 다 보여주면서도 화면을 왜소하게 만들지 않으려면 스크롤 외엔 대안이 없다).

### ⚠ 발견한 위험 — 라이선스 박스 폰트가 CJK를 못 그린다

`licenseBox.Font = New-Object System.Drawing.Font('Consolas', 9)` (line 331, 고정). Consolas는 **한글·일본어·중국어 글리프가 없다.** 영문 MIT 원문(고정폭이 의미 있는 코드성 텍스트가 아니라 그냥 법률 문서 산문)에는 Consolas를 쓸 이유가 약하고, 그 위에 붙는 `license.summary`/`license.authoritativeNote`(로케일 텍스트, ko/ja/zh 포함)까지 같은 컨트롤·같은 폰트를 쓴다.

Windows는 GDI+ 폰트 링킹으로 없는 글리프를 시스템 폴백 폰트로 대체해 그리므로 **두부(□□□)가 뜨지는 않을 것**으로 예상되지만(실측 못 함 — 이 부분은 렌더링을 직접 봐야 확정되는 "추정"), Consolas(고정폭 라틴) 옆에 가변폭 CJK 폴백 글리프가 섞이면 줄 정렬이 어긋나고 자간이 불균일해 보일 수 있다.

**권고**: `licenseBox.Font`를 로케일 폰트(`Get-UiFontName $lang`, 9pt)로 바꾸고, 영문 MIT 원문 부분만 고정폭이 필요하면 원문 블록에 한해 별도 `RichTextBox` + 폰트 구간 지정을 검토. 다만 이건 설계 변경 폭이 있으므로 **최소 조치**로는: 로케일 요약·고지문 두 줄만이라도 Consolas 대신 `Get-UiFontName $lang`을 쓰는 것으로 충분하다(원문은 영문이라 Consolas로 유지해도 무방 — 정본이라는 상징적 의미도 있다).

---

## 3. 로케일별 문자열 길이표 — 실측

측정 조건: `TextRenderer.MeasureText(text, font, Size(0,0), TextFormatFlags.NoPadding)` — **패딩 없이 순수 글리프 폭만 잰 값**이다. 실제 WinForms 렌더링은 컨트롤 내부 여백이 몇 px 더 필요하므로, 이 표의 "실측 폭"에 **최소 +10~15px 안전마진**을 더한 값을 컨트롤 최소 폭으로 삼을 것. 폰트: ko/기본 = 맑은 고딕 9pt, ja = Yu Gothic UI 9pt, zh = Microsoft YaHei UI 9pt (제목은 13pt Bold, 나머지는 9pt Regular — `wizard.ps1`이 실제로 쓰는 값과 동일).

### 3.1 공통 버튼 (`common.*`)

| 키 | ko | en | ja | zh | 현재 컨트롤 폭 | 최대 실측 | 판정 |
|---|---|---|---|---|---|---|---|
| common.cancel | 취소 (31px) | Cancel (43px) | キャンセル (53px) | 取消 (32px) | 90px | 53px | ✅ |
| common.back | < 이전 (43px) | < Back (44px) | < 戻る (39px) | < 上一步 (57px) | 90px | 57px | ✅ |
| common.next | 다음 > (43px) | Next > (44px) | 次へ > (40px) | 下一步 > (57px) | 100px | 57px | ✅ |
| common.install | 설치 (31px) | Install (38px) | インストール (60px) | 安装 (32px) | 100px(next 재사용) | 60px | ✅ |
| common.close | 닫기 (31px) | Close (36px) | 閉じる (37px) | 关闭 (32px) | 100px(next 재사용) | 37px | ✅ |
| common.browseFolder | 찾아보기... (64px) | Browse... (54px) | 参照... (40px) | 浏览... (41px) | 110px | 64px | ✅ |

`btnNext`가 next/install/close 세 가지 문구를 돌려쓰므로(리사이즈 안 함) 셋 중 최대(60px, ja "インストール")를 기준으로 100px 폭이면 여유 충분.

### 3.2 STEP 3 (Java 선택) — 가장 좁은 버튼들이 몰려 있는 구간, 실제 클리핑 발견

| 키 | ko | en | ja | zh | 현재 폭 | 최대 실측 | 판정 |
|---|---|---|---|---|---|---|---|
| step3.discover | 탐색 (31px) | Discover (53px) | 検出 (31px) | 检测 (32px) | 70px | 53px | ✅ (여유 17px, 안전마진 감안 시 빠듯) |
| step3.browseJava | 찾아보기 (55px) | Browse (45px) | 参照 (31px) | 浏览 (32px) | 75px | 55px | ✅ |
| step3.verify | 검증(java -version 실행) (135px) | Verify (run java -version) (140px) | 検証 (java -version を実行) (145px) | 验证 (运行 java -version) (146px) | 200px | 146px | ✅ |
| step3.systemJava (라디오 라벨) | 117px | 113px | 134px | 107px | 250px | 134px | ✅ |
| step3.bundledJava (라디오 라벨) | 292px | **349px** | 314px | 224px | 420px | 349px | ✅ (여유 71px) |

### 3.3 STEP 4 (포트 지정) — ❌ 클리핑 확인

| 키 | ko | en | ja | zh | 현재 폭 | 최대 실측 | 판정 |
|---|---|---|---|---|---|---|---|
| step4.findPort | 가용 포트 찾기 (87px) | Find available port (106px) | **利用可能なポートを検索 (124px)** | 查找可用端口 (80px) | **120px** | **124px** | ❌ 일본어 4px 초과, 실측이 패딩 제외값이므로 실제로는 더 잘림 |
| step4.testPort | 테스트 (43px) | Test (28px) | テスト (33px) | 测试 (32px) | 80px | 43px | ✅ |

**조치 지시**: `btnFindPort.Size`를 `New-Object System.Drawing.Size(140, 26)`로(120→140), `btnTestPort.Location.X`를 그만큼(115+140+10=265 부근) 밀 것. STEP 4 바디 폭 여유(560px 중 245까지만 사용 중)로 볼 때 여유 있음.

### 3.4 STEP 5 (요약/설치) 및 라이선스 동의 체크박스

| 키 | ko | en | ja | zh | 현재 폭 | 최대 실측 | 판정 |
|---|---|---|---|---|---|---|---|
| step1.acceptLicense | 162px | 156px | 144px | 140px | 400px | 162px | ✅ |
| step5.startMenuShortcut | 151px | 153px | **173px** | 128px | 300px | 173px | ✅ |
| step5.desktopShortcut | 147px | 135px | **159px** | 104px | 300px | 159px | ✅ |

### 3.5 제목·언어 라벨

| 키 | ko | en | ja | zh | 현재 폭 | 최대 실측 | 판정 |
|---|---|---|---|---|---|---|---|
| wizard.heading (13pt Bold) | 218px | 237px | **263px** | 199px | 400px | 263px | ✅ |
| lang.selectorLabel | 34px | **62px** | 34px | 35px | 60px | 62px | ❌ (§1 조치 지시 참조) |
| step.progress.3 (진행 라벨 예시) | 87px | 114px | 95px | 91px | 560px | 114px | ✅ 압도적 여유 |

### 3.6 요약 — 조치가 필요한 두 곳만

1. `langLabel` 폭 60→78px (§1)
2. `btnFindPort` 폭 120→140px, 그 오른쪽 `btnTestPort` 위치 재조정 (§3.3)

나머지는 이미 안전마진을 포함해 여유 있게 잡혀 있다(설계 단계에서 이미 CJK를 고려한 흔적 — `step3.bundledJava` 420px, `wizard.heading` 400px 등은 라틴 기준으로만 잡았다면 이만큼 여유를 안 뒀을 폭이다).

---

## 4. 폰트 전략

이미 구현·확인됨 (총괄이 실제 설치 여부 확인: Yu Gothic·Microsoft YaHei·Malgun Gothic·Meiryo·SimSun 모두 있음):

```powershell
function Get-UiFontName {
  param([string]$Lang)
  switch ($Lang) {
    'ja' { return 'Yu Gothic UI' }
    'zh' { return 'Microsoft YaHei UI' }
    default { return '맑은 고딕' }   # ko 및 en 공용
  }
}
```

| 로케일 | 폰트 | 폴백 순서(권고) | 비고 |
|---|---|---|---|
| ko | 맑은 고딕 (Malgun Gothic) | 맑은 고딕 → Segoe UI → 시스템 기본 | 한글+라틴 글리프 모두 보유, en도 이 폰트를 공유해도 무방(라틴 가독성 문제없음) |
| en | 맑은 고딕 (Malgun Gothic) | 〃 | 별도 폰트를 안 두고 ko와 공유하는 현재 구현이 합리적 — Segoe UI로 굳이 나눌 이유 없음(전환 시 레이아웃 흔들림만 커짐) |
| ja | Yu Gothic UI | Yu Gothic UI → Meiryo UI → MS UI Gothic | Meiryo는 폭이 더 넓어(줄바꿈 계산이 달라짐) 폴백으로만, 기본은 Yu Gothic UI 유지 |
| zh | Microsoft YaHei UI | Microsoft YaHei UI → SimSun | SimSun은 구형·가독성 낮음, 최후 폴백으로만 |

WinForms는 `New-Object System.Drawing.Font(name, size)` 생성 시 해당 이름의 폰트가 시스템에 없으면 **조용히 GenericSansSerif로 대체**한다(예외를 던지지 않는다). 즉 위 표의 "폴백 순서"는 코드로 명시적으로 체이닝하지 않는 한 자동으로 작동하지 않는다 — 폴백을 실제로 타게 하려면 `FontFamily.Families`를 확인해 존재하는 첫 폰트를 고르는 헬퍼가 필요하다(현재 미구현, VDI 폐쇄망마다 폰트 설치 상태가 다를 수 있으므로 권고사항으로 남김. 이번 브리핑에서는 이미 4종 모두 설치 확인됐다고 해서 우선순위를 낮춰도 됨).

---

## 5. 접근성

### 5.1 확인된 공백

`installer/wizard.ps1` 전체에서 `AcceptButton`/`CancelButton`/`TabIndex` 지정을 grep했으나 **전무함**. 즉:

- **Enter 키**: 포커스가 텍스트박스에 있을 때 Enter를 눌러도 "다음"이 눌리지 않는다(버튼에 포커스가 가 있을 때만 스페이스/Enter로 클릭됨). 마우스 없이는 매 단계 Tab으로 버튼까지 이동해야 진행 가능.
- **Esc 키**: `CancelButton` 미지정이라 Esc로 창을 닫을 수 없다.
- **Tab 순서**: 명시적 `TabIndex`가 없으므로 컨트롤을 `.Controls.Add()`한 순서를 따른다. 폼 레벨 추가 순서가 `titleLabel → langLabel → langCombo → stepLabel → bodyPanel(→ 현재 보이는 panelN의 자식들) → navPanel(Cancel→Back→Next)`이므로, **매 단계 진입 시 Tab을 처음 누르면 언어 콤보로 간다** — 언어 콤보가 위저드 전역 컨트롤이라는 점에서 나쁘지 않지만, 의도한 설계인지는 명시적으로 정해 둬야 한다(현재는 컨트롤 추가 순서의 부작용일 뿐 의도적 설정이 아님).

### 5.2 권고 규격

| 항목 | 권고 |
|---|---|
| `$form.AcceptButton` | `$btnNext` — 단계마다 버튼 텍스트가 바뀌므로(다음/설치/닫기) 참조만 고정하면 텍스트 전환과 무관하게 항상 "주 진행 동작"에 연결됨 |
| `$form.CancelButton` | `$btnCancel` — Esc로 위저드 취소, 기존 `$btnCancel.Add_Click({ $form.Close() })`와 동일 동작이라 안전 |
| Tab 순서 (단계별) | 라벨/제목 제외, 입력 가능 컨트롤만: (해당 단계 본문 컨트롤 위→아래, 왼→오) → langCombo → Cancel → Back → Next. 즉 **본문 조작이 먼저, 전역 컨트롤(언어)과 네비게이션은 나중**이 사용자가 "지금 이 화면에서 할 일"에 먼저 닿는다는 원칙에 맞음. 현재 구현은 반대(langCombo가 먼저) — `TabIndex`를 명시적으로 부여해 뒤집을 것 |
| 기본 포커스 | 각 단계 진입 시 그 단계의 첫 입력 컨트롤에 `.Focus()`. STEP 1은 `chkAccept`(라이선스를 다 읽었는지와 무관하게 스크롤 먼저 되게 하려면 `licenseBox`에 포커스하되 `TabStop=false`로 두고 Tab이 체크박스로 바로 가게 하는 절충도 가능), STEP 2는 `pathBox`, STEP 3은 `radioSystemJava`, STEP 4는 `portBox`, STEP 5는 `chkStartMenu` |
| 체크박스류 스페이스바 토글 | WinForms 기본 동작이라 별도 조치 불요(CheckBox/RadioButton은 기본적으로 스페이스로 토글됨) |
| 언어 콤보 접근성 | `DropDownList` 스타일이라 이미 키보드로 조작 가능(포커스 후 방향키/문자 첫 글자로 이동) — 추가 조치 불요 |

---

## 6. 요약 — 다른 에이전트에게 넘길 조치 목록

수정은 이 문서의 책임이 아니므로 **지시 사항으로만** 남긴다.

1. `langLabel.Size` 60→78px (폭 부족으로 "Language:" 클리핑 실측 확인).
2. `btnFindPort.Size` 120→140px, `btnTestPort.Location.X` 265 부근으로 재배치 (일본어 "利用可能なポートを検索" 클리핑 실측 확인).
3. `licenseBox.Font`를 로케일 요약 부분만이라도 Consolas 대신 `Get-UiFontName $lang`로 — CJK 자간 불균일 위험(실측은 못 했음, 렌더링 확인 필요 — "추정").
4. `$form.AcceptButton = $btnNext`, `$form.CancelButton = $btnCancel` 추가.
5. 각 컨트롤에 명시적 `TabIndex` 부여 — 언어 콤보보다 본문 컨트롤이 먼저 오도록.
6. 단계 전환(`$showStep`) 시 해당 단계 첫 입력 컨트롤에 `.Focus()` 호출 추가.

나머지 모든 문자열·컨트롤 폭 조합은 실측상 안전마진 내에 있어 **추가 조치 불필요**.
