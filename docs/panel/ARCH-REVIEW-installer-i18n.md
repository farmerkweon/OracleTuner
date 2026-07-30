# ARCH-REVIEW — 설치 위저드 다국어화(4개국어) 설계 검토

- 검토자: P-ARCH (읽기 전용 레인)
- 대상: `installer/lang.ps1`, `installer/wizard.ps1`, `installer/uninstall.ps1`, `tools/build-installer.js`
- 상태: 구현 진행 중 스냅샷 기준. installer/ 는 건드리지 않았음.

---

## 0. 요약 (5줄)

1. **설계 방향(별도 lang.ps1 + Apply-Language + en 기준 SelfTest)은 맞다.** 다만 세 가지 치명 결함이 있다.
2. **[치명] `tools/build-installer.js:77-79` 가 `lang.ps1` 을 스테이징에 담지 않는다** → 빌드된 EXE 는 `wizard.ps1:57` 의 dot-source 에서 즉사한다.
3. **[치명] `ui.locale` 은 아무도 읽지 않는다.** `server/config.js:66` 에 키는 있으나 `web/js/i18n.js:520-530` 은 localStorage/navigator 만 본다 → `wizard.ps1:199` 의 기록은 현재 **쓰고 버리는 값**이다.
4. **[치명] 인코딩** — UTF-8 **BOM 없음**이면 PS 5.1 이 ANSI(cp949)로 읽어 CJK 가 전부 깨진다. 이 머신에서 **실측 재현 완료**. 현재 세 파일 모두 BOM 이 있어 지금은 정상이나, 보호 장치가 없다.
5. Q1(생성 vs 수기)은 **수기 유지가 정답**이다 — 키 교집합이 실측 **0개**라 뽑아 쓸 것이 없다.

---

## 1. Q1 — 문자열 테이블을 별도 파일로 두는 것이 맞는가?

### 실측 근거

| 항목 | 값 | 방법 |
|---|---|---|
| `installer/lang.ps1` 키 수 | **58** | `'<key>' =` 패턴 추출 |
| `web/js/i18n.js` 키 수 | **373** | `'<key>':` 패턴 추출 |
| **두 집합의 교집합** | **0개** | `comm -12` |

가장 비슷한 것조차 위저드의 `common.cancel` / `common.close` 대 앱의 `res.cancel` / `help.close` 로,
네임스페이스도 문맥도 다르다. 위저드 키는 전부 `step1.*`~`step5.*`, `license.*`, java/port 계열이고
앱에는 존재하지 않는다.

### 판정: 생성하지 마라. 수기 `lang.ps1` 유지가 옳다.

- "번역이 두 곳에 흩어지는 중복"이라는 전제는 **사실이 아니다.** 중복된 것은 *내용*이 아니라 *메커니즘*이다.
  같은 문장이 두 곳에 있는 사례는 기껏해야 "취소/닫기" 두세 단어뿐이다.
- 코드젠을 넣으면 얻는 것(두세 단어의 동기화) 대비 잃는 것이 크다:
  - `web/js/i18n.js` 는 **ES 모듈**(`export const`)이라 `require()` 로 못 읽는다. 파서를 새로 만들거나
    동적 `import()` 로 로드해야 한다 → 빌드 스크립트에 파싱 부채가 생긴다.
  - 생성물(`lang.ps1`)에 **BOM 을 반드시 붙여야** 한다(3장). Node `fs.writeFileSync` 기본값은 BOM 없음이라
    실수하면 4개 언어 전체가 깨진다. 즉 코드젠이 **인코딩 사고의 새 입구**를 만든다.
  - 위저드 문구는 앱 문구와 성격이 다르다(설치 경로/권한/라이선스 안내). 앱 i18n.js 에 위저드 전용 키
    58개를 얹으면 앱 번들이 쓰지도 않는 문자열을 지고 다닌다.

### 권고 (대안)

중복이 아니라 **불일치**를 막고 싶은 것이므로, 코드젠 대신 **검사**로 푼다.

- (필수) `wizard.ps1 -SelfTest` 의 `Test-StringTableCompleteness` 는 이미 en 기준 차집합을 본다(`lang.ps1:317-327`).
  이걸 **빌드 게이트**로 승격하라 — `tools/build-installer.js` 의 `stage()` 직전에
  `powershell -File installer/wizard.ps1 -SelfTest` 를 돌려 exit code 가 0 이 아니면 빌드를 중단.
  지금은 SelfTest 를 사람이 기억해서 돌려야만 의미가 있다.
- (선택) 위저드/앱에 동시에 등장하는 소수 단어(취소/닫기/다음)는 그냥 각자 두어라. 세 단어를 위해
  빌드 파이프라인을 엮는 것은 결합도 대비 이득이 없다.

---

## 2. Q2 — Apply-Language 방식의 함정

### 현재 구조와 실제 위험

`wizard.ps1:708-749` 의 `$applyLanguage` 는 **26개 컨트롤의 `.Text` 를 손으로 나열**한다.
생성 시점(`:250`~`:632`)에도 같은 문자열을 한 번씩 쓰므로, **한 컨트롤당 대입 지점이 2곳**이다.
컨트롤을 추가할 때 생성부만 쓰고 `$applyLanguage` 를 빠뜨리면 — **아무 에러 없이 그 컨트롤만 기본 언어로 굳는다.**

더 나쁜 것은 현재 `-SelfTest`(`wizard.ps1:914-927`)가 이걸 **못 잡는다**는 점이다.
언어 전환 후 검사하는 것은 `Form.Text` 와 `LicenseBox.Text` 가 비어있지 않은지뿐이다.
26개 중 25개를 빠뜨려도 SelfTest 는 전부 OK 를 찍는다.

### 권고: `Tag` 에 키를 심고 컨트롤 트리를 순회하라 (Tag 는 현재 미사용 — grep 확인)

```powershell
# 생성 시점: 텍스트와 키를 한 번에, 한 곳에서 묶는다
function Set-I18nText {
  param($Control, [string]$Key)
  $Control.Tag  = $Key
  $Control.Text = Str $Key
  return $Control
}

# 동적 텍스트(경로/포트/실행결과)는 "잊은 것"과 구분되도록 명시적 표식을 둔다
function Set-I18nDynamic { param($Control) $Control.Tag = '@dynamic'; return $Control }

# 적용: 폼 전체를 재귀 순회
function Apply-I18nTree {
  param($Parent)
  foreach ($c in $Parent.Controls) {
    if ($c.Tag -is [string] -and $c.Tag -and $c.Tag -ne '@dynamic') { $c.Text = Str $c.Tag }
    if ($c.Controls.Count -gt 0) { Apply-I18nTree $c }
  }
}
```

`$applyLanguage` 는 그러면 이렇게 줄어든다:

```powershell
$applyLanguage = {
  param([string]$lang)
  ...
  Apply-I18nTree $form                 # 정적 텍스트 26줄 -> 1줄
  & $renderJavaResult                  # -f 서식이 필요한 3개만 콜백 유지
  & $renderPortResult
  & $renderInstallResult
  $licenseBox.Text = Build-LicenseDisplayText -Lang $lang -SourceRoot $SourceRoot
  ...
}.GetNewClosure()
```

**핵심은 이 SelfTest 를 함께 넣는 것이다** — 구조만 바꾸면 여전히 `Tag` 설정을 잊을 수 있다:

```powershell
# 폼 전체를 훑어 "텍스트는 있는데 Tag 가 없는" 컨트롤을 실패로 잡는다
function Find-UntaggedControls {
  param($Parent, [System.Collections.ArrayList]$Acc)
  foreach ($c in $Parent.Controls) {
    if ($c.Text -and -not ($c.Tag -is [string] -and $c.Tag)) { [void]$Acc.Add($c.Name + '/' + $c.Text) }
    if ($c.Controls.Count -gt 0) { Find-UntaggedControls $c $Acc }
  }
}
```

이러면 "컨트롤을 추가했는데 번역을 빠뜨렸다"가 **컴파일 에러에 준하는 즉시 실패**가 된다.
추가로 언어 전환 후 폼 전체에서 `!key!` 표식(`lang.ps1:292` 의 미스 마커)과 U+FFFD 가 하나도 없어야 한다는
단언도 넣어라 — 키 누락과 인코딩 사고를 동시에 잡는다.

**단, 지금 설계에서 잘한 부분은 유지하라.** 실행 결과 라벨을
`@{ Kind = 'success'; Args = @(...) }` 상태로 들고 있다가 다시 그리는 패턴(`wizard.ps1:450-470`, `:545-576`)은
`-f` 서식이 필요한 문자열의 정석이다. Tag 순회로 대체하려 들지 말고 그대로 두어라.

### 트레이드오프

| 방식 | 장점 | 단점 |
|---|---|---|
| 현행(수동 나열) | 읽으면 무엇이 바뀌는지 한눈에 보임. PS 초심자도 수정 가능 | 대입 지점 2곳. 누락이 무증상. SelfTest 로 못 잡음 |
| Tag + 트리 순회 | 대입 지점 1곳. 누락을 SelfTest 가 구조적으로 검출 | 재귀·`@dynamic` 규약을 팀이 알아야 함. `-f` 서식은 여전히 콜백 필요 |

컨트롤이 26개까지 늘어난 시점에서 **Tag 방식으로 전환할 값어치가 충분하다.**
전면 교체가 부담되면 최소한 **`Find-UntaggedControls` 계열 SelfTest 단언만이라도 먼저 넣어라** — 이것만으로
현행 구조의 무증상 누락은 사라진다.

---

## 3. Q3 — PowerShell 인코딩 규칙 (실측 근거 있음)

### 실측 재현

이 머신(Windows PowerShell **5.1.26100.8875**, **ACP = 949**, 콘솔 CP 65001)에서
같은 내용의 `.ps1` 을 BOM 유/무로 각각 만들어 `powershell -NoProfile -ExecutionPolicy Bypass -File` 로 실행:

```
[BOM 없음 ] ?ㅼ튂|?ㅳ꺍?밤깉?쇈꺂|若됭즳      <- 전부 깨짐
[BOM 있음 ] 설치|インストール|安装             <- 정상
```

원인: **Windows PowerShell 5.1 은 BOM 이 없는 스크립트 파일을 시스템 ANSI 코드페이지로 디코딩한다.**
UTF-8 로 저장했는데 BOM 이 없으면 한국 머신에서는 cp949 로 읽혀 위와 같이 깨진다.
(PowerShell 7 은 BOM 없음을 UTF-8 로 가정하므로 **개발자가 pwsh 로만 테스트하면 이 사고를 절대 못 본다** —
실행 경로는 `build-installer.js:170` 이 박아 넣은 `powershell`(=5.1)이다.)

**단순 글자 깨짐으로 끝나지 않는다.** ja-JP(cp932) / zh-CN(cp936) 머신에서는 UTF-8 바이트가
2바이트 문자로 잘못 뭉쳐지면서 트레일 바이트가 백틱(0x60)이나 따옴표(0x22)로 해석될 수 있고,
그러면 글자가 깨지는 게 아니라 **스크립트가 파싱 에러로 죽는다.** 폐쇄망 현장에서 진단 불가능한 종류의 실패다.

### 확정 규칙

| 파일 | 인코딩 | 비고 |
|---|---|---|
| `installer/lang.ps1` | **UTF-8 with BOM (필수)** | 현재 BOM 있음 — 확인함 |
| `installer/wizard.ps1` | **UTF-8 with BOM (필수)** | 현재 BOM 있음 — 확인함 |
| `installer/uninstall.ps1` | **UTF-8 with BOM (필수)** | 현재 BOM 있음 — 확인함 |
| `.bat` 런처 | **ASCII only** (비ASCII 금지) | `.bat` 은 OEM CP(949/932/936)로 읽힌다. BOM 은 `@echo off` 앞에 붙어 오히려 깨진다 |
| `settings.json` / `version.json` | `Set-Content -Encoding utf8` (=BOM 붙음) OK | `server/config.js:91-94` 가 BOM 을 벗겨낸다 — 이미 대응됨 |
| `installer.sed` (IExpress) | **ASCII only** | INI/ANSI 파서. 3.3 참조 |

### 3.1 [필수] BOM 을 지키는 자동 장치를 넣어라

BOM 은 **눈에 안 보이고**, VS Code 의 "UTF-8" 저장, git 설정, 다른 도구로 편집,
Node 로 재생성 — 어느 경로로든 조용히 사라진다. 규칙만 문서에 적어두면 반드시 언젠가 깨진다.

`wizard.ps1 -SelfTest` 에 넣을 것:

```powershell
foreach ($f in @('lang.ps1','wizard.ps1','uninstall.ps1')) {
  $p = Join-Path $PSScriptRoot $f
  $b = [System.IO.File]::ReadAllBytes($p)
  ST-Assert "$f 는 UTF-8 BOM 으로 저장돼 있다" ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
}
# 그리고 '내용' 자체도 검사한다 — 잘못 디코딩됐다면 여기서 걸린다
ST-Assert 'ko 문자열에 한글이 살아 있다' ((Get-Str -Lang 'ko' -Key 'wizard.title') -match '[가-힣]')
ST-Assert 'ja 문자열에 가나가 살아 있다' ((Get-Str -Lang 'ja' -Key 'wizard.title') -match '[ぁ-んァ-ヶ]')
ST-Assert 'zh 문자열에 한자가 살아 있다' ((Get-Str -Lang 'zh' -Key 'wizard.title') -match '[\u4e00-\u9fff]')
```

BOM 검사만으로는 부족하다 — **BOM 이 있어도 원본이 이미 깨진 채 저장됐을 수 있다.** 위 정규식 단언이 그것을 잡는다.

### 3.2 [권고] 폰트 이름에서 CJK 리터럴을 없애라

`lang.ps1:305` 의 `return '맑은 고딕'` 은 **인코딩 사고가 조용한 실패로 이어지는 정확한 지점**이다.
실측:

```
FontFamily.Families 에 '맑은 고딕' 포함  -> False   (.NET 은 불변 영문명만 열거)
New-Object Font('맑은 고딕',9).Name      -> 'Malgun Gothic'   (ko-KR 로케일에서만 해석 성공)
New-Object Font('NoSuchFontXYZ',9).Name  -> 'Microsoft Sans Serif'  (예외 없음! 조용히 폴백)
```

즉 이름이 조금이라도 깨지면 **예외 없이** Microsoft Sans Serif 로 떨어진다 — 화면은 뜨는데 글꼴만 이상해지고
원인 추적이 어렵다. 게다가 로컬라이즈된 패밀리명 해석은 스레드 로케일에 의존하므로,
**ja-JP/zh-CN Windows 에서 `'맑은 고딕'` 이 해석되리라는 보장이 없다.**

→ **불변 영문명 `'Malgun Gothic'` 을 써라.** 이 머신에서 두 이름 모두 동일 폰트로 해석됨을 확인했고,
영문명은 ASCII 라 인코딩 사고에서 자유롭고 로케일 의존도 없다.

### 3.3 [중] IExpress SED 와 런처 .bat 의 비ASCII

- `build-installer.js:249` — `FriendlyName` 에 `OracleTuner ${version} 설치`(한글)가 들어가고,
  `:228` 에서 **BOM 없는 UTF-8** 로 저장된다. IExpress 의 SED 는 INI(ANSI) 파서로 읽으므로
  EXE 속성/설치 창 제목에 mojibake 가 남는다. → `Setup` 등 **ASCII 로 바꿔라**.
- `build-installer.js:166` — 런처 배치에 `echo payload.zip 압축 해제 실패`(한글)가 들어가고
  `:174` 에서 UTF-8 로 저장된다. `.bat` 은 OEM CP 로 읽히므로 ko 머신에서도 깨지고 ja/zh 머신에서는 확실히 깨진다.
  → **ASCII 영문으로 바꿔라**(`echo Failed to extract payload.zip`). 참고로 `wizard.ps1:230` 의
  `Write-Launcher` 는 `-Encoding ASCII` + ASCII 본문으로 **이미 올바르게** 되어 있다 —
  build-installer.js 쪽만 규칙에서 벗어나 있다.

---

## 4. Q4 — 설치 후 앱 언어와의 연결

### 확인 결과 (요청하신 대로 실제 grep 함)

- `server/config.js:66` 에 **`ui.locale: 'ko'` 이 존재한다.** (DEFAULTS 안)
- `wizard.ps1:194-202` 는 이미 `ui = @{ locale = $State.Language }` 를 settings.json 에 쓰고 있다.
- **그러나 `ui.locale` 을 읽는 코드는 리포 전체에 없다.** (`ui.locale|locale` 전역 grep 결과 —
  소비처는 `design/render.js`(SVG 렌더러)와 `gridkit.js`(그리드 로케일)뿐, 둘 다 무관.)
- `web/js/i18n.js:520-530` 의 `initLang()` 은 **localStorage('ot.lang') → navigator.language → 'ko'** 만 본다.
- 순서 문제: `web/js/app.js:127` 에서 `initShell()`(→ `:59 initLang()`)이 **동기로** 먼저 돌고,
  `api.getConfig()` 는 `:186` 에서 **한참 뒤에** await 된다.

### 판정: 연결하라. 단, 위저드 쪽은 이미 다 했고 남은 일은 전부 web/ 쪽이다.

키가 이미 스키마에 있고 위저드가 이미 쓰고 있으므로 "억지로 만드는" 경우가 아니다.
현재 상태는 **쓰기만 하고 읽는 사람이 없는 반쪽 배선**이며, 이대로 출시하면
"위저드에서 일본어를 골랐는데 앱은 한국어로 뜬다"는 버그 리포트가 확정적으로 들어온다.

필요한 변경(**installer/ 밖 — 이 레인 소관 아님, 총괄이 web 레인에 배정해야 함**):

1. `web/js/i18n.js:520` — `initLang()` 이 install-time 힌트를 받도록 인자 추가
   ```js
   export function initLang(installHint) {
     let saved = null;
     try { saved = localStorage.getItem('ot.lang'); } catch (e) {}
     if (!saved && installHint && M['app.title'][installHint]) saved = installHint;   // 추가
     if (!saved) { const nav = (navigator.language || 'ko').slice(0,2).toLowerCase();
                   saved = M['app.title'][nav] ? nav : 'ko'; }
     ...
   }
   ```
2. `web/js/app.js:125-127` — `initShell()` 앞에서 config 를 한 번 받아 힌트로 넘긴다
   (`:186` 의 `getConfig()` 결과를 재사용하도록 위로 끌어올리면 왕복 추가 없음. 실패 시 `null` 로 폴백).

**우선순위는 반드시 localStorage > ui.locale > navigator.language 여야 한다.**
사용자가 앱 안에서 언어를 바꾸면 `setLang()`(`i18n.js:454`)이 localStorage 에 쓰므로,
설치 시 선택이 나중 선택을 덮어쓰는 일은 이 순서로 자동 방지된다.

### 반드시 같이 고쳐야 할 함정 — `DEFAULTS.ui.locale = 'ko'`

`config.load()` 는 DEFAULTS 와 사용자 파일을 **deepMerge** 한다(`config.js:108`).
따라서 **settings.json 이 아예 없어도 `ui.locale` 은 항상 `'ko'` 로 채워져 온다.**
이 값을 그대로 힌트로 쓰면 개발/포터블 사용자와 설치 시 en 을 고른 사용자까지
전부 한국어로 끌려간다 — `navigator.language` 폴백이 영구히 죽는다.

→ **`server/config.js:66` 을 `locale: ''` (빈 문자열 = 자동 판정) 로 바꿔라.**
빈 값이면 "설치 시 선택 없음"으로 해석해 `navigator.language` 로 넘어간다.
grep 으로 확인했듯 이 키의 소비처가 지금 **하나도 없으므로 회귀 위험이 0** 이다.
이 한 줄을 놓치면 4장 배선은 "항상 한국어" 버그로 바뀐다.

---

## 5. Q5 — uninstall.ps1 의 언어 결정

### 현재 상태 (전문 읽음)

- `uninstall.ps1` 은 **아직 `lang.ps1` 을 dot-source 하지 않는다.** 문자열이 한국어로 하드코딩돼 있다
  (`:95`, `:100-103`, `:111`).
- `Write-VersionJson`(`wizard.ps1:166-181`)이 만드는 `version.json` 에는
  `version/installedAt/port/javaMode/javaHome` 만 있고 **`language` 가 없다.**

### 권고: `version.json` 에 `language` 를 추가하고, 3단 폴백으로 결정하라

```powershell
function Get-UninstallLanguage {
  param([string]$InstallDir)
  # 1) 사용자별 최신 선택 — 앱 안에서 언어를 바꿨다면 이쪽이 더 최신이다
  $s = Join-Path $env:LOCALAPPDATA 'OracleTuner\config\settings.json'
  if (Test-Path $s) {
    try { $v = (Get-Content $s -Raw | ConvertFrom-Json).ui.locale
          if ($v) { return $v } } catch { }
  }
  # 2) 설치 시점 선택 — 설치 폴더에 남아 있어 항상 읽을 수 있다
  $v2 = Join-Path $InstallDir 'version.json'
  if (Test-Path $v2) {
    try { $v = (Get-Content $v2 -Raw | ConvertFrom-Json).language
          if ($v) { return $v } } catch { }
  }
  # 3) OS 언어
  return Get-DefaultLanguage
}
```

**왜 두 곳 다 봐야 하는가 (한 곳으로 못 줄이는 이유):**

| 저장처 | 장점 | 못 미더운 이유 |
|---|---|---|
| `%LOCALAPPDATA%\...\settings.json` | 사용자가 앱에서 바꾼 최신 언어 반영 | 사용자 단위. **관리자가 다른 계정으로 제거를 실행하면 존재하지 않는다.** 사용자가 "데이터 삭제"를 이미 했거나 수동 정리했으면 없다 |
| `<설치폴더>\version.json` | 제거 스크립트 바로 옆이라 **항상 있다**. 권한 문제 없음(읽기) | 머신 단위. 설치 이후 사용자가 언어를 바꿔도 갱신 안 됨 |

`%LOCALAPPDATA%` 에 별도 설정 파일을 새로 만들 필요는 **없다** — 이미 `settings.json` 이 있고
`ui.locale` 스키마도 있다. 새 파일을 만들면 제거 대상만 하나 더 늘어난다.

**주의:** `Remove-InstallTree`(`uninstall.ps1:23`)가 `version.json` 을 지우므로,
**언어 판정은 삭제보다 반드시 먼저** 해야 한다. 확인 대화상자가 삭제 전이므로 순서상 자연스럽다.

**추가:** `Remove-InstallTree` 의 삭제 목록에 `lang.ps1` 이 없다(`:23`).
지금은 `:115` 의 지연 폴더 삭제(cmd 예약 실행)가 폴더째 날리므로 결과적으로 지워지지만,
그 예약 삭제가 실패하면(6장 R4 참조) `lang.ps1` 과 `uninstall.ps1` 만 남는 어중간한 상태가 된다.

---

## 6. Q6 — 그 외 놓친 위험

### R1 [치명·즉시] `lang.ps1` 이 배포판에 들어가지 않는다

`tools/build-installer.js:77-79`:
```js
fs.mkdirSync(path.join(stageDir, 'installer'), { recursive: true });
fs.cpSync(.../'wizard.ps1',   .../'installer/wizard.ps1');
fs.cpSync(.../'uninstall.ps1', .../'installer/uninstall.ps1');
//  <- lang.ps1 없음
```
결과 (두 군데서 동시에 터진다):
1. `wizard.ps1:57` — `. (Join-Path $PSScriptRoot 'lang.ps1')` 가 파일 없음으로 실패.
   `$ErrorActionPreference = 'Stop'`(`:46`)이라 **위저드가 뜨지도 못하고 죽는다.**
2. `wizard.ps1:160-163` — `Install-AppFiles` 가 설치 폴더로 복사할 `lang.ps1` 도 없어
   `uninstall.ps1` 의 dot-source 까지 연쇄로 깨진다.

**개발 환경(리포에서 직접 `wizard.ps1` 실행)에서는 절대 재현되지 않는다** — 리포에는 파일이 있으니까.
`-SelfTest` 도 리포에서 돌리므로 통과한다. **오직 빌드된 EXE 에서만 터진다.**

수정 방향(파일이 하나 더 늘어도 다시 안 빠지도록):
```js
for (const f of ['wizard.ps1', 'uninstall.ps1', 'lang.ps1']) {
  fs.cpSync(path.join(P.root, 'installer', f), path.join(stageDir, 'installer', f));
}
```
더 나은 방법은 `fs.readdirSync(installer)` 로 `*.ps1` 전부를 담는 것이다 — 목록 관리 자체를 없앤다.
그리고 스테이징 직후 **`installer/*.ps1` 3개가 실제로 존재하는지 assert** 하라.

### R2 [치명] `Write-LocalAppDataSettings` 가 기존 설정을 통째로 덮어쓴다

`wizard.ps1:194-202` 는 `java/server/ui` 세 블록만 담은 새 객체를 만들어 그대로 저장한다.
**병합이 아니다.** 같은 위치에 재설치(업그레이드)하면 사용자가 설정한
`jdbc.driverPaths`, `execution.maxRows/timeoutSec/benchRuns`, `ui.theme/skin/density/fontSize`,
`java.options` 가 **전부 사라진다.**

폐쇄망에서 `jdbc.driverPaths` 를 손으로 잡아둔 사용자에게는 재설치 = 접속 불능이다.
→ 기존 파일이 있으면 읽어서 **깊은 병합** 후 쓰거나, 최소한 `java.home`/`server.port`/`ui.locale`
세 값만 **덮어쓰기 대상으로 한정**하라. `config.js:71-80` 의 `deepMerge` 와 같은 의미로.

`ui.locale` 도 마찬가지다 — 재설치 시 사용자가 앱에서 고른 언어를 위저드 선택이 밀어낸다.
(다만 4장의 우선순위 설계상 localStorage 가 이기므로 체감 영향은 작다.)

### R3 [상] `uninstall.ps1` 을 리포에서 직접 실행하면 `installer/` 폴더를 지운다

`uninstall.ps1:91` 이 `$InstallDir = $PSScriptRoot` 로 잡고, `:115` 가 그 폴더를 통째로 지우는
자기삭제 명령을 cmd 로 예약한다.
리포의 `E:\...\OracleTuner\installer\uninstall.ps1` 을 실수로 더블클릭하면
**소스 `installer/` 폴더가 통째로 날아간다.** 설치본과 원본이 같은 파일이라 구분 수단이 없다.

→ 가드를 넣어라: `version.json` 과 `OracleTuner.bat` 이 옆에 없으면
"설치본이 아닙니다"라고 알리고 `exit 1`. 마침 5장에서 `version.json` 을 읽게 되므로 자연스럽게 붙는다.

### R4 [상] Program Files 설치 + 권한 — 제거가 조용히 실패한다

- `wizard.ps1:116` 에 `Test-IsUnderProgramFiles` 가 있고 `:379` 에서 경고를 띄운다 — **좋다.**
  기본 설치 경로도 `%LOCALAPPDATA%\Programs\OracleTuner`(`:238`)로 잡혀 있다. 옳은 선택이다.
- 그러나 사용자가 굳이 Program Files 를 고르면:
  - `Install-AppFiles` 의 `Copy-Item` 이 UAC 없이 실패 → `:793` 의 catch 가 잡아 메시지를 보여준다. OK.
  - `uninstall.ps1` 은 **상황이 더 나쁘다.** `:25` 의 `-ErrorAction SilentlyContinue` 와
    `:116` 의 예약 삭제는 **실패해도 아무 말이 없다.** 사용자에게는 `:111` 의
    "제거가 완료되었습니다"만 뜨고 파일은 그대로 남는다. **거짓 성공 메시지다.**
    → 삭제 결과를 확인해 실패 시 관리자 권한 안내(다국어 키로)를 띄워라.
- `-Encoding utf8` 로 `settings.json` 을 쓰는 것은 `%LOCALAPPDATA%` 라 권한 문제 없음. 확인함.

### R5 [상] LICENSE 개행 — 라이선스 본문이 한 줄로 뭉칠 가능성

- 실측: 리포 루트 `LICENSE` 는 **LF 전용**이다 (lone LF 31개, CRLF 0개, 1420 bytes).
- `Build-LicenseDisplayText`(`lang.ps1:380`)는 `Get-Content -Raw` 로 원문을 **그대로** 가져와
  CRLF 로 만든 머리말 뒤에 붙인다 → 본문 부분만 LF.
- 실측: WinForms 멀티라인 TextBox 는 네이티브 핸들 생성 후에도 **LF 를 CRLF 로 정규화하지 않는다**
  (되읽은 문자열에 CR 없음 확인). Win32 EDIT 컨트롤은 CRLF 만 줄바꿈으로 렌더링한다.
- **미확인**: 실제 화면 렌더링은 GUI 없이 확정하지 못했다. 다만 위 사실관계상 **깨질 가능성이 매우 높고**,
  고치는 비용이 한 줄이다:
  ```powershell
  $body = (Get-Content $licensePath -Raw) -replace "`r`n", "`n" -replace "`n", "`r`n"
  ```
  `$MitLicenseFallback`(`lang.ps1:332~`) 쪽도 here-string 이라 파일 개행에 따라가므로 같은 처리를 하라.
- 부수 효과: 이 버그가 있으면 `-SelfTest`(`:922`)의 "라이선스 본문 비어있지 않음"은 **통과한다.**
  텍스트는 있으니까. 즉 SelfTest 로 못 잡는 부류다.

### R6 [중] `Get-Culture` 는 UI 언어가 아니라 **지역 서식**이다

`lang.ps1:266-274` 는 `(Get-Culture).TwoLetterISOLanguageName` 을 쓴다.
이는 제어판의 "국가 또는 지역 형식"이지 **표시 언어**가 아니다.
기업 표준 이미지에서 표시 언어는 한국어인데 형식만 English (United States) 로 잡힌 경우가 흔하고,
그러면 한국 사용자에게 영어 위저드가 뜬다.

→ **`Get-UICulture` 를 먼저 보고, 실패 시 `Get-Culture` 로 폴백하라.**
앱의 `navigator.language`(브라우저 UI 언어)와 의미가 맞는 쪽도 `Get-UICulture` 다.
```powershell
$code = $null
try { $code = (Get-UICulture).TwoLetterISOLanguageName } catch { }
if (-not $code) { try { $code = (Get-Culture).TwoLetterISOLanguageName } catch { return 'en' } }
```

### R7 [중] 폐쇄망 + ja/zh 폰트 — 두부(tofu) 위험

`Get-UiFontName`(`lang.ps1:300-307`)이 `Yu Gothic UI`(ja) / `Microsoft YaHei UI`(zh) 를 요구한다.
이 머신에서는 **둘 다 존재**함을 확인했다(339개 폰트 설치됨).
그러나 Windows 10/11 에서 일본어·중국어 보조 글꼴은 **Features on Demand** 로,
ko-KR 기본 이미지에는 설치돼 있지 않을 수 있다. **폐쇄망에서는 내려받을 수 없다.**
없으면 Font 생성자는 예외 없이 Microsoft Sans Serif 로 폴백하고(3.2 실측),
글리프가 없는 문자는 네모(두부)로 렌더링될 수 있다.

→ 방어:
```powershell
function Get-UiFontName {
  param([string]$Lang)
  $prefer = switch ($Lang) {
    'ja' { @('Yu Gothic UI','Meiryo UI','Meiryo','MS UI Gothic') }
    'zh' { @('Microsoft YaHei UI','Microsoft YaHei','SimSun') }
    default { @('Malgun Gothic','Gulim') }
  }
  $have = [System.Drawing.FontFamily]::Families.Name
  foreach ($f in $prefer) { if ($have -contains $f) { return $f } }
  return 'Segoe UI'
}
```
**미확인**: 실제 고객사 VDI 이미지의 폰트 구성은 확인할 수 없다. 위 폴백은 확인 불가 상황에 대한 방어다.

### R8 [중] SelfTest 가 잡지 못하는 것들 — 신뢰의 범위를 좁혀라

현재 `-SelfTest`(`wizard.ps1:830-927`)가 검증하는 것: 폼 생성, 패널 5개, 콤보 4항목, 키 차집합,
4개 언어 전환 시 예외 없음 + `Form.Text`/`LicenseBox` 비어있지 않음.

**잡지 못하는 것 (전부 실제 출시 사고로 이어지는 것들):**

| 사고 | 왜 안 잡히나 | 대책 |
|---|---|---|
| `lang.ps1` 미배포 (R1) | 리포에서 돌리면 파일이 있음 | 빌드 후 스테이징에서 `-SelfTest` 를 한 번 더 실행 |
| BOM 유실 (3장) | 검사 자체가 없음 | 3.1 의 바이트 검사 + 스크립트 정규식 검사 |
| 컨트롤 번역 누락 (2장) | 2개 컨트롤만 확인 | `Find-UntaggedControls` + `!key!`/U+FFFD 전수 검사 |
| 라이선스 개행 (R5) | "비어있지 않음"만 봄 | 본문 CRLF 개수 > 10 단언 |
| 하드코딩 잔재 | 검사 없음 | `wizard.ps1`/`uninstall.ps1` 소스에서 주석 밖 한글 리터럴 검출 |

### R9 [중] `uninstall.ps1` 은 아직 다국어화 전이다

현재 `:95`, `:100-103`, `:111` 이 한국어 하드코딩. `lang.ps1` dot-source 도 없다.
`Install-AppFiles`(`:160-163`)가 `lang.ps1` 을 설치 폴더에 복사하는 배선은 이미 되어 있으므로,
`. (Join-Path $PSScriptRoot 'lang.ps1')` 한 줄 + 5장의 `Get-UninstallLanguage` 만 붙이면 된다.
**단 `$ErrorActionPreference='Stop'`(`:19`) 이므로 `lang.ps1` 이 없으면 제거 자체가 불가능해진다** —
제거는 최후의 탈출구이므로 여기만은 `try { . lang.ps1 } catch { }` + 영문 하드코딩 폴백을 두어라.
설치가 깨져서 제거하려는 사용자가 "제거도 안 되는" 상황에 빠지면 안 된다.

### R10 [정보] zh 는 간체/번체 구분이 없다

`(Get-*Culture).TwoLetterISOLanguageName` 은 zh-CN/zh-TW/zh-HK 를 모두 `zh` 로 접는다.
대만·홍콩 사용자에게 간체가 나간다. **앱의 `web/js/i18n.js:524` 도 동일하게 동작**하므로
위저드만 다르게 만들 이유는 없다. 지금은 그대로 두고 인지만 해두면 된다(일관성 > 정밀도).

---

## 7. 우선순위 요약

| # | 항목 | 심각도 | 소관 | 공수 | 근거 |
|---|---|---|---|---|---|
| 1 | `build-installer.js` 에 `lang.ps1` 추가 | 출시 차단 | 빌드 | 1줄 | `build-installer.js:77-79` |
| 2 | `ui.locale` 소비 배선 + `DEFAULTS.ui.locale=''` | 기능 미완 | **web/server (별도 레인)** | ~5줄 | `i18n.js:520`, `app.js:127`, `config.js:66` |
| 3 | BOM 검사 + CJK 정규식 검사 SelfTest | 무증상 사고 | installer | ~10줄 | 실측 재현 |
| 4 | `Write-LocalAppDataSettings` 병합 저장 | 데이터 유실 | installer | ~15줄 | `wizard.ps1:194-202` |
| 5 | `uninstall.ps1` 다국어화 + 언어 판정 | 요구사항 | installer | ~30줄 | `uninstall.ps1` 전체 |
| 6 | LICENSE 개행 정규화 | 표시 깨짐 | installer | 1줄 | `lang.ps1:380`, LF 31/CRLF 0 |
| 7 | `Get-UICulture` 우선 | 오판정 | installer | 3줄 | `lang.ps1:268` |
| 8 | 폰트: 영문명 + 존재 확인 폴백 | 폐쇄망 | installer | ~10줄 | 실측(폴백 무예외) |
| 9 | uninstall 자기 폴더 삭제 가드 | 데이터 파괴 | installer | 3줄 | `uninstall.ps1:91,115` |
| 10 | Tag 기반 i18n + 누락 검출 SelfTest | 유지보수 | installer | ~40줄 | `wizard.ps1:708-749` |
| 11 | .bat/.sed 비ASCII 제거 | 표시 깨짐 | 빌드 | 2줄 | `build-installer.js:166,249` |
| 12 | 제거 실패 시 거짓 성공 메시지 | 신뢰 | installer | ~10줄 | `uninstall.ps1:25,111` |

---

## 8. 참조 (전부 직접 열어 확인함)

- `E:\IBANK\SeTools\OracleTuner\installer\lang.ps1:14` — `$Strings` 4로케일 해시테이블 시작
- `E:\IBANK\SeTools\OracleTuner\installer\lang.ps1:266-274` — `Get-DefaultLanguage`, `Get-Culture` 사용
- `E:\IBANK\SeTools\OracleTuner\installer\lang.ps1:281-293` — `Get-Str`, en 폴백 + `!key!` 마커
- `E:\IBANK\SeTools\OracleTuner\installer\lang.ps1:300-307` — `Get-UiFontName`, CJK 리터럴 `'맑은 고딕'`
- `E:\IBANK\SeTools\OracleTuner\installer\lang.ps1:317-327` — `Test-StringTableCompleteness`
- `E:\IBANK\SeTools\OracleTuner\installer\lang.ps1:371-386` — `Build-LicenseDisplayText`, LICENSE 개행 미정규화
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:57` — `lang.ps1` dot-source (배포판에서 실패)
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:129-164` — `Install-AppFiles`, uninstall/lang 복사
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:166-181` — `Write-VersionJson` (`language` 없음)
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:194-202` — settings.json 덮어쓰기, `ui.locale` 기록
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:450-470`, `:545-576` — 동적 라벨 상태 보존 패턴 (좋음)
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:708-749` — `$applyLanguage`, 26개 수동 나열
- `E:\IBANK\SeTools\OracleTuner\installer\wizard.ps1:901-927` — 다국어 SelfTest (검증 범위 부족)
- `E:\IBANK\SeTools\OracleTuner\installer\uninstall.ps1:19,23,91,111,115` — Stop 정책/삭제목록/자기삭제
- `E:\IBANK\SeTools\OracleTuner\tools\build-installer.js:77-79` — **lang.ps1 누락**
- `E:\IBANK\SeTools\OracleTuner\tools\build-installer.js:157-176` — 런처 bat, 한글 + UTF-8
- `E:\IBANK\SeTools\OracleTuner\tools\build-installer.js:228,249` — SED UTF-8 저장 + 한글 FriendlyName
- `E:\IBANK\SeTools\OracleTuner\server\config.js:62-68` — `ui.locale: 'ko'` (소비처 없음)
- `E:\IBANK\SeTools\OracleTuner\server\config.js:91-94` — JSON BOM 제거 (이미 대응됨)
- `E:\IBANK\SeTools\OracleTuner\web\js\i18n.js:520-530` — `initLang()`, `ui.locale` 미참조
- `E:\IBANK\SeTools\OracleTuner\web\js\app.js:59,125-127,186` — `initLang()` 이 `getConfig()` 보다 먼저
- `E:\IBANK\SeTools\OracleTuner\server\paths.js:47-64` — 설치 모드 판정, `%LOCALAPPDATA%\OracleTuner`

### 실측 로그

| 실험 | 결과 |
|---|---|
| PS 5.1 UTF-8 BOM 없음 스크립트 | `?ㅼ튂 / ?ㅳ꺍?밤깉?쇈꺂 / 若됭즳` (깨짐) |
| PS 5.1 UTF-8 BOM 있음 스크립트 | `설치 / インストール / 安装` (정상) |
| 실행 환경 | PS 5.1.26100.8875, ACP=949, 콘솔CP=65001 |
| `installer/*.ps1` 현재 인코딩 | 3개 모두 UTF8-BOM (정상) |
| `Font('맑은 고딕')` / `Font('없는폰트')` | `Malgun Gothic` / `Microsoft Sans Serif` (예외 없이 폴백) |
| `FontFamily.Families` 에 `'맑은 고딕'` | **False** (영문명만 열거) |
| LICENSE 개행 | lone LF 31, CRLF 0 |
| WinForms TextBox LF 라운드트립 | CR 미포함 — 정규화 안 함 |
| i18n 키 교집합 (위저드 58 vs 앱 373) | **0개** |
