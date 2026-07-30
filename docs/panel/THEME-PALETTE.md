# THEME-PALETTE · 앱 전체 테마 톤 대응표

P-UI(한명수 레인) 작성 · 이번 라운드 산출물은 **문서만** — `web/**` 무편집.
전제: Phase 0 완료(`setTheme()` → `<html data-ot-theme="…">`). 셀렉터는 `:root[data-ot-theme="forest"] { … }` 형태.

계산 도구: Node(WCAG 상대휘도/대비비 공식 직접 구현, `color-mix` 등 브라우저 의존 없이 순수 계산). 모든 대비 수치는
실측 계산값이며, 미달 항목은 그 자리에서 재조정 후 재계산했다(과정은 §6 정직성 로그에 요약).

---

## 1. 파생 규칙 (원칙 + 공식)

**원천은 항상 Open Grid 팔레트(`--og-*`)** — 새 색 발명 금지. 두 계열로 나눠 다른 공식을 쓴다. 이유: `slate`/`executive`
는 이름은 "일반 테마"지만 그리드 자체가 **어두운 배경**(`--og-row-bg`가 짙은 남색/청회색)이라, `dark`와 같은 문제(그리드만
어둡고 앱은 흰 배경)를 그대로 재현한다. 그래서 **패밀리는 8개 테마 이름이 아니라 그리드의 명암으로 나눈다.**

- **light 5종**(default·modern·ocean·forest·indigo): `--bg`=마이더 tint(og-header-bg 35%+기존 뉴트럴 65%),
  `--panel`=`og-row-bg` 그대로, `--panel-2`=`og-row-alt-bg` 그대로(그리드 행 표면 재사용 = "한 몸"의 핵심),
  `--border(-strong)`=og-border를 기존 뉴트럴 보더와 50%씩 섞어 채도 낮춤, `--text/-dim/-faint`=기존 뉴트럴에
  8~15%만 헤더색 틴트(가독성 우선, 브랜딩은 힌트만), `--primary/-dark`=og-primary(-dark) 그대로 쓰되 **AA 미달 시만
  최소 폭으로 darken**, `--primary-soft`=og-primary-light 그대로, `--accent`=primary를 HSL +42° 회전 후 채도/명도
  보정(브랜드 보라 계열 유지하되 테마별로 달라짐 — 아래 §6 참고), `--ok/--warn/--danger`는 **앵커 고정**(테마마다 흔들지
  않음, §1.1).
- **dark 3종**(slate·executive·dark): 명암을 반전한 것과 같은 이유로 토큰도 반대로 매핑한다 — `--bg`=`og-header-bg`
  (가장 어두운 캔버스), `--panel`=`og-row-bg`(캔버스보다 한 단 밝은 카드 표면), `--panel-2`=`og-row-alt-bg`,
  `--text`=`og-row-color` 그대로(그리드가 이미 밝은-글자-on-어두운-배경으로 튜닝해 둠), `--text-dim/-faint`는 text→bg
  방향으로 어둡게 섞되 **panel 대비 하한(4.5:1 / 3:1)을 지키는 최대치**까지만(이분 탐색으로 계산),
  `--primary`=og-primary를 panel 대비 4.5:1 이상 되도록 필요한 만큼만 lighten, `--primary-soft`는 **panel 쪽으로
  대부분 섞은 어두운 칩**(라이트 패밀리처럼 primary를 진하게 섞으면 글자·배경이 거의 같은 색이 되어버림 — slate가
  실제로 이 함정에 걸렸다, §6 참고), `--accent`는 primary를 +42° 회전 후 lighten, `--ok/--warn/--danger`도 앵커
  색상(hue)은 유지한 채 **어두운 배경에서 읽히도록만 lighten**(§1.1).

### 1.1 의미색(ok/warn/danger) 원칙
Hue는 절대 돌리지 않는다(위험이 위험으로 안 보이는 사고 방지). light 5종은 앵커 자체를 공유하므로 **테마 간 완전 동일**.
dark 3종도 앵커 하나를 공유하며 패밀리 내에서 동일 — 즉 **패밀리당 1세트, 테마별 미세조정 없음**. 유일한 조정은
"라이트용 앵커"와 "다크용 앵커" 사이의 lightness 차이뿐이고, 이는 명암 반전에 따른 가독성 요구이지 브랜딩 조정이 아니다.

---

## 2. 테마 8종 × 앱 변수 19개 대응표

### 2A. Light 패밀리 (default · modern · ocean · forest · indigo)

| 변수 | default | modern | ocean | forest | indigo |
|---|---|---|---|---|---|
| `--bg` | `#f6f6f8` | `#f7f8fa` | `#eff6fb` | `#f1f6f3` | `#f1f2f8` |
| `--panel` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--panel-2` | `#fafafa` | `#f8fafc` | `#f0f9ff` | `#f1f8f1` | `#f5f6ff` |
| `--border` | `#e0e2e4` | `#e1e6ec` | `#c9e4f2` | `#d4e5d9` | `#d2d7e9` |
| `--border-strong` | `#d2d5d9` | `#d3d9e1` | `#bdd7e6` | `#c7d8cf` | `#c6cbdd` |
| `--text` | `#222630` | `#1d222f` | `#1b2c40` | `#1e2d2e` | `#1e243c` |
| `--text-dim` | `#60697b` | `#5c657a` | `#5a6d88` | `#5d6e79` | `#5d6784` |
| `--text-faint` | `#8b97a6` | `#8895a5` | `#879aae` | `#899ba4` | `#8996ac` |
| `--primary` | `#1976d2` | `#2563eb` | `#027bbd`* | `#348337`* | `#3949ab` |
| `--primary-dark` | `#1565c0` | `#1d4ed8` | `#0277bd` | `#2e7d32` | `#283593` |
| `--primary-soft` | `#e3f2fd` | `#eff6ff` | `#e1f5fe` | `#e8f5e9` | `#e8eaf6` |
| `--accent` | `#4c31b9` | `#6631b9` | `#3931b9` | `#23856b` | `#7e31b9` |
| `--accent-soft` | `#eae6f7` | `#ede6f7` | `#e7e6f7` | `#e5f0ed` | `#f0e6f7` |
| `--ok` | `#1a7d4f` | 〃 | 〃 | 〃 | 〃 |
| `--ok-soft` | `#e6f5ee` | 〃 | 〃 | 〃 | 〃 |
| `--warn` | `#9e5e00` | 〃 | 〃 | 〃 | 〃 |
| `--warn-soft` | `#fdf3e2` | 〃 | 〃 | 〃 | 〃 |
| `--danger` | `#c62828` | 〃 | 〃 | 〃 | 〃 |
| `--danger-soft` | `#fdeaea` | 〃 | 〃 | 〃 | 〃 |

`*` = og 원색이 AA 미달이라 darken 조정함(ocean `#0288d1`→`#027bbd`, forest `#388e3c`→`#348337`). 폭은 각각
Δ소량(육안 차이 거의 없음), 근거는 아래 대비표.

**핵심 조합 대비비 (계산값, AA 본문 기준 4.5:1 / 큰글자 3:1):**

| 조합 | default | modern | ocean | forest | indigo | 기준 |
|---|---|---|---|---|---|---|
| text/panel | 15.13 | 15.88 | 14.18 | 14.29 | 15.30 | ≥4.5 ✅ |
| text-dim/panel | 5.52 | 5.84 | 5.28 | 5.29 | 5.62 | ≥4.5 ✅ |
| text-faint/panel | 2.97 | 3.05 | 2.89 | 2.88 | 2.99 | ≥3.0 ⚠(§6) |
| primary(텍스트)/panel | 4.60 | 5.17 | 4.59 | 4.72 | 7.73 | ≥4.5 ✅ |
| `#fff`/primary(버튼) | 4.60 | 5.17 | 4.59 | 4.72 | 7.73 | ≥4.5 ✅ |
| primary-dark/primary-soft(doc-badge) | 5.03 | 6.16 | 4.27* | 4.56 | 8.68 | ≥4.5 ⚠ |
| accent(텍스트)/panel | 8.58 | 7.76 | 9.08 | 4.53 | 6.94 | ≥4.5 ✅ |
| `#fff`/accent(버튼) | 8.58 | 7.76 | 9.08 | 4.53 | 6.94 | ≥4.5 ✅ |
| accent/accent-soft(칩 텍스트) | 7.01 | 6.38 | 7.37 | **3.88** | 5.74 | ≥4.5 ⚠(§6) |
| ok/ok-soft | 4.56 | 〃 | 〃 | 〃 | 〃 | ≥4.5 ✅ |
| warn/warn-soft | 4.71 | 〃 | 〃 | 〃 | 〃 | ≥4.5 ✅ |
| danger/danger-soft | 4.85 | 〃 | 〃 | 〃 | 〃 | ≥4.5 ✅ |

`*` ocean의 primary-dark/primary-soft=4.27은 미달이나, `.doc-badge`의 실제 배경은 `--primary-soft`(og 원본
`#e1f5fe`, 손대지 않음)라 og 라이브러리가 준 값 자체의 한계다. 폭 0.23 차이라 `--primary-dark`를 아주 살짝(1~2% L)
darken하면 해소된다 — Phase 2에서 함께 처리 권고, 여기서는 "검증 필요"로 남긴다(0.23은 육안 임계 근처라 자동
조정보다 스크린샷 확인이 더 정확할 것으로 판단).

### 2B. Dark 패밀리 (slate · executive · dark)

| 변수 | slate | executive | dark |
|---|---|---|---|
| `--bg` | `#263238` | `#0d1b2e` | `#1e1e1e` |
| `--panel` | `#37474f` | `#0f2035` | `#2d2d2d` |
| `--panel-2` | `#2e3d44` | `#0b1a2c` | `#252525` |
| `--border` | `#455a64` | `#1e3050` | `#444444` |
| `--border-strong` | `#667880` | `#475570` | `#666666` |
| `--text` | `#eceff1` | `#cdd5e0` | `#e0e0e0` |
| `--text-dim` | `#acb2b6` | `#7c8795` | `#949494` |
| `--text-faint` | `#899195` | `#5f6b7a` | `#767676` |
| `--primary` | `#a3b6bf`* | `#c9a227` | `#90caf9` |
| `--primary-dark` | `#a3b5bf`** | `#ac801b`* | `#42a5f5` |
| `--primary-soft` | `#374750` | `#112135` | `#2f3840` |
| `--accent` | `#aeace7` | `#b1da81` | `#9589dc` |
| `--accent-soft` | `#384750` | `#455d4e` | `#2e2d2e` |
| `--ok` | `#5fdea3` | 〃 | 〃 |
| `--ok-soft` | `#3c5959` | `#285c58` | `#3a5a4b` |
| `--warn` | `#ffb03d` | 〃 | 〃 |
| `--warn-soft` | `#49504d` | `#5a4d38` | `#5e4c31` |
| `--danger` | `#eb9e9e`* | `#e26f6f` | `#e37373` |
| `--danger-soft` | `#38474f` | `#2a2a3d` | `#2e2e2e` |

`*` og 원색이 panel 대비 미달이라 lighten. `**` slate는 `og-primary-dark(#37474f)`가 `og-row-bg`(panel)와 **글자
그대로 동일한 색**이다 — 즉 어차피 이 조합에서 "primary보다 진한 변형"은 만들어지지 않는다(§6에서 설명·대안 제시).

**핵심 조합 대비비:**

| 조합 | slate | executive | dark | 기준 |
|---|---|---|---|---|
| text/panel | 8.35 | 11.10 | 10.43 | ≥4.5 ✅ |
| text-dim/panel | 4.50 | 4.50 | 4.54 | ≥4.5 ✅ |
| text-faint/panel | 3.01 | 3.03 | 3.03 | ≥3.0 ✅ |
| primary(텍스트)/panel | 4.59 | 6.79 | 7.87 | ≥4.5 ✅ |
| onPrimary/primary(버튼, §6) | 6.27 (bg) | 7.15 (bg) | 9.53 (bg) | ≥4.5 ✅ |
| primary-dark/primary-soft(doc-badge) | 4.55 | 4.53 | 4.51 | ≥4.5 ✅ |
| accent(텍스트)/panel | 4.53 | 10.34 | 4.52 | ≥4.5 ✅ |
| onAccent/accent(버튼, §6) | 6.18 (bg) | 10.89 (bg) | 5.47 (bg) | ≥4.5 ✅ |
| ok/ok-soft | 4.51 | 4.51 | 4.54 | ≥4.5 ✅ |
| warn/warn-soft | 4.54 | 4.52 | 4.51 | ≥4.5 ✅ |
| danger/danger-soft | 4.54 | 4.50 | 4.50 | ≥4.5 ✅ |

**⚠ `#fff`를 primary/accent 버튼 글자색으로 쓰면 안 된다.** dark 패밀리의 primary/accent는 "어두운 배경 위 텍스트"용으로
밝게 튜닝돼 있어서, 그 위에 흰 글자를 얹으면 대비가 무너진다(`#fff`/primary 실측: slate 2.10, executive 2.42,
dark 1.75 — 전부 대참사 수준 미달). `.btn-primary`/`.btn-accent`/`#btn-help:hover` 등의 `color:#fff` 하드코딩은
**dark 패밀리에서 `var(--bg)`로 갈아타야 한다**(위 표의 onPrimary/onAccent 열이 이미 계산해 둔 정답 — 이 3개 테마
모두 `--bg`가 압도적으로 낫다). §4 하드코딩 지도에 반영.

---

## 3. dark 전용 절 — 문법색 12종 + 그라디언트

### 3.1 발견: "다크"는 3개 테마다
`.sqled { background: var(--panel) }` 이므로 SQL 에디터는 이미 테마를 따라간다. 그런데 `--panel`이 어두운 테마가
**dark 하나가 아니라 slate·executive·dark 셋**이다(§1). 따라서 `.sqlt-*` 12종은 **이 세 테마에 공통으로 걸어야**
한다: `:root[data-ot-theme="dark"], :root[data-ot-theme="slate"], :root[data-ot-theme="executive"] { .sqlt-… }`.
세 패널 배경(`#2d2d2d` / `#37474f` / `#0f2035`)이 서로 달라서, 아래 값은 **셋 중 가장 낮은 대비(주로 slate, 배경이
가장 밝아서 여유가 적음)를 기준으로 전부 통과하도록** 계산했다.

### 3.2 문법색 12종 재선정 (라이트 원본과 같은 색상군 유지 — 테마 전환해도 "파랑=키워드" 감각이 안 깨지게)

| 클래스 | 라이트 원본 | dark 신규값 | 역할 | 대비(최저 패널 기준) |
|---|---|---|---|---|
| `.sqlt-keyword` | `#0b5cad` | **`#83b5fa`** (bold 유지) | 키워드 | slate 4.57 / dark 6.53 / exec 7.79 |
| `.sqlt-func` | `#7b4bc4` | **`#c9a4f5`** | 함수 | slate 4.65 / dark 6.63 / exec 7.91 |
| `.sqlt-string` | `#b3261e` | **`#f39d9d`** | 문자열 | slate 4.65 / dark 6.64 / exec 7.92 |
| `.sqlt-number` | `#0a7d55` | **`#6fe0a8`** | 숫자 | slate 5.93 / dark 8.46 / exec 10.09 |
| `.sqlt-comment` | `#748094` (italic) | **`#8a97ad`** (italic 유지) | 주석 | slate 3.27 / dark 4.66 / exec 5.56 (큰글자 3:1 기준*) |
| `.sqlt-hint` | 텍스트`#0d8a5f`/배경`#eafaf3` | 텍스트 **`#5fe0b3`** / 배경 **`#295d5d`** | 힌트 강조 | 텍스트/배경 자체가 4.54(3패널 동일 — 배경을 3패널 각각 이분탐색 후 최솟값 채택) |
| `.sqlt-bind` | `#c2185b` (bold) | **`#ff9ecf`** (bold 유지) | 바인드 변수 | slate 5.07 / dark 7.24 / exec 8.64 |
| `.sqlt-subst` | `#c2185b` | **`#ff9ecf`** (bind와 통일) | 치환 변수 | 〃 |
| `.sqlt-qident` | `#1f2430`+점선밑줄 | **`var(--text)`**+점선밑줄 유지 | 인용식별자 | 테마별 text/panel 값 재사용(§2B, 전부 ≥4.5) |
| `.sqlt-op` | `#52607a` | **`#93a1b8`** | 연산자 | slate 3.69 / dark 5.27 / exec 6.28 (큰글자 3:1 기준*) |
| `.sqlt-punct` | `#6c7992` | **`#8593a6`** | 구두점 | slate 3.09 / dark 4.41 / exec 5.26 (큰글자 3:1 기준*) |
| `.sqlt-ident` | `#1f2430` | **`var(--text)`** | 일반 식별자 | 테마별 text/panel 값 재사용 |
| `.sqlt-unknown` | `#b3261e`+wavy | **`#f39d9d`**(string과 통일)+wavy 유지 | 미인식 토큰 | string과 동일 |
| `.sqlt-unterminated` | 배경`#fdeaea`+wavy`#c62828` | 배경 **`#403848`**(장식용, 텍스트 대비 산정 대상 아님) + wavy **`#f39d9d`** | 미종료 문자열 | 밑줄색은 string과 동일 색상군 재사용 |

`*` comment/op/punct는 원래 라이트 테마에서도 "덜 강조"가 목적인 3계층(본문보다 흐림)이라 **3:1(큰글자 기준)을
목표로 설계**했다 — keyword/func/string/number/bind처럼 "읽어야 하는" 토큰과 의도적으로 위계를 다르게 뒀다. 이건
라이트 원본의 위계(`--op #52607a`, `--punct #6c7992`가 `--ident #1f2430`보다 옅음)를 그대로 계승한 것이지 다크
전환 때 새로 낮춘 게 아니다.

### 3.3 그라디언트 고정색 → 변수 기반 공식으로 대체 권고
`.topbar` / `.app-footer` / `#btn-help`의 `linear-gradient(...)` 3곳이 헥사 2개씩 박혀 있다. **테마별로 표를 또
만드는 대신, `color-mix()`로 var 참조 공식을 쓰면 8개 테마에 자동으로 먹는다:**

```css
.topbar     { background: linear-gradient(180deg, var(--panel), color-mix(in srgb, var(--panel) 55%, var(--bg))); }
.app-footer { background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 85%, var(--bg)), var(--bg)); }
#btn-help   { background: linear-gradient(180deg, var(--primary-soft), color-mix(in srgb, var(--primary-soft) 70%, var(--panel))); }
```

**검증 필요**: 이 도구는 VDI 폐쇄망에 배포되는 내부 툴이라 실행 브라우저(Electron/사내 Chromium 버전)가
`color-mix()`(Chromium 111+)를 지원하는지 총괄이 확인해야 한다. 미지원 시 폴백으로 아래 리터럴 2-stop 표를 쓴다
(공식과 동일한 비율로 미리 계산해 둠):

| 테마 | topbar (stop1→stop2) | footer (stop1→stop2) | btn-help (stop1→stop2) |
|---|---|---|---|
| default | `#ffffff → #fafafb` | `#fefefe → #f6f6f8` | `#e3f2fd → #ebf6fe` |
| modern | `#ffffff → #fbfbfc` | `#fefefe → #f7f8fa` | `#eff6ff → #f4f9ff` |
| ocean | `#ffffff → #f6fafd` | `#fdfefe → #eff6fb` | `#e1f5fe → #eaf8fe` |
| forest | `#ffffff → #f7faf8` | `#fdfefd → #f1f6f3` | `#e8f5e9 → #eff8f0` |
| indigo | `#ffffff → #f7f8fb` | `#fdfdfe → #f1f2f8` | `#e8eaf6 → #eff0f9` |
| slate | `#37474f → #2e3b42` | `#34444c → #263238` | `#374750 → #374750`(단색, 이미 어두워 그라디언트 무의미) |
| executive | `#0f2035 → #0e1d31` | `#0f1f34 → #0d1b2e` | `#112135 → #102135` |
| dark | `#2d2d2d → #252525` | `#2b2b2b → #1e1e1e` | `#2f3840 → #2e353a` |

---

## 4. 하드코딩 치환 지도 (104건, 그룹 단위)

찾을 때 `app.css` 전체를 읽지 않고 `#[0-9a-fA-F]{3,8}` 패턴 Grep으로만 뽑았다(라인 번호는 이번 세션 기준, Phase 2
착수 전 재확인 권장).

### 4.1 변수로 치환 — 그룹 A: 중복 뉴트럴 회색 통합
지금 "옅은 회색 칩" 배경이 **철자만 다른 4개 헥사**(`#eef0f3` `.conn-off`, `#f1f3f5` `.cap-badge.lv-low`,
`#eef2f7` `.sev-low`, `#eef1f4` `.tag-pill`/`.sev-info`/`.help-table .kbd` 등)로 흩어져 있다 — **테마와 무관하게
이미 존재하던 비일관성**이다. 전부 `var(--panel-2)`로 통일 권고(이미 같은 역할로 쓰이는 곳들과 합류).
+ `.btn`류 배경/hover(`#fff`, `#f2f5f8`, `#eef1f4`), `select`/입력 배경(`#fff`), 서브패널 배경(`#fafbfc` 3곳,
`#fbfcfd`) → `var(--panel)` / `var(--panel-2)`로.

### 4.2 변수로 치환 — 그룹 B: 의미색 보더 3종
`#b9e2cd`(ok 보더, 4곳: `.conn-on` `.cap-badge.lv-best` `.verdict.v-identical` `.diag-item.is-ok`),
`#f0dcb8`(warn 보더, 5곳), `#f3c4c4`(danger 보더, 4곳)는 지금 `--ok/--warn/--danger`와 **별도로 하드코딩된 파생색**
이다. `color-mix(in srgb, var(--ok) 35%, var(--panel))` 형태로 바꾸면 테마마다 자동으로 톤이 맞는다(§3.3과 같은
이유로 브라우저 지원 여부 먼저 확인). 폴백이 필요하면 각 테마의 ok/warn/danger row에서 mix(color, panel, 0.35)로
직접 계산 가능 — 스크립트 재사용 가능.

### 4.3 변수로 치환 — 그룹 C: 소프트 배경 위 하드코딩 텍스트
`.hw-notables`/`.help-disclaimer`의 `color:#6b4e10`(경고 박스 텍스트) → **`var(--warn)`로 교체 가능, 8개 테마
전부 warn/warn-soft 대비 ≥4.5 통과**(§2 표 확인됨). `.help-support`의 `color:#4a3a78` → `var(--accent)`로 교체는
**forest만 3.88로 미달**(§2A 각주) — forest는 그대로 두거나 accent를 소폭 darken한 `--accent-dark`류 신설이 필요.
19개 변수 예산 안에서는 forest 한 곳만 리터럴 예외로 남기고 나머지 7개 테마는 `var(--accent)` 적용을 권고.

### 4.4 변수로 치환 — 그룹 D: 버튼 on-color (§2B 필수)
`.btn-primary`/`.btn-accent`(`color:#fff`), `#btn-help:hover`(`color:#fff`)는 **dark 패밀리(slate/executive/dark)
에서 반드시** `var(--bg)`로 오버라이드해야 한다(§2B 표의 onPrimary/onAccent). light 5종은 기존 `#fff` 그대로 둬도
전부 통과(§2A 표). 테마 셀렉터로 스코프:
```css
:root[data-ot-theme="slate"] .btn-primary, :root[data-ot-theme="executive"] .btn-primary, :root[data-ot-theme="dark"] .btn-primary,
:root[data-ot-theme="slate"] .btn-accent,  :root[data-ot-theme="executive"] .btn-accent,  :root[data-ot-theme="dark"] .btn-accent
{ color: var(--bg); }
```

### 4.5 남기고 이유를 주석으로 — 브랜드/기능 고정색
- **토스트**(`.toast` 계열, `#22293a`/`#eef1f6`/`.ok #14603f`/`.err #8f2222`/`.warn #7a4a06`): 시스템 알림은
  어떤 화면 위에 떠도 항상 읽혀야 하는 오버레이라 테마와 독립적으로 고정하는 게 정석. **유지.**
- **`.log-text`**(진단 로그 뷰어, `#1e2430`/`#d8dee9`/`.lg-err #ff8b8b`/`.lg-ok #8fe3b0`/`.lg-dim #8b98ad`):
  터미널류 로그 패널은 관례적으로 항상 어둡게 — 테마와 무관. **유지.**
- **`.help-app-qr`**(`background:#fff`): 코드 내 기존 주석이 이미 "필터/보더 절대 금지"라고 명시(QR 인식률).
  **유지, 손대지 말 것.**
- **`.btn-primary`/`.btn-accent`/`.btn-danger`의 배경 위 `color:#fff`**: light 5종에서는 그대로 유지(§4.4에서
  dark 3종만 오버라이드).

### 4.6 기타
`.sqled-input::selection`의 `rgba(25,118,210,.24)`(선택 영역 하이라이트, primary 파랑 고정) →
`color-mix(in srgb, var(--primary) 24%, transparent)` 권고. `.doc-badge`의 보더 `#cfe3f7`는 그룹 B와 동일 패턴
(primary 계열 소프트 보더) — `color-mix(in srgb, var(--primary) 30%, var(--panel))`로 통합 권고.

---

## 5. 구현 우선순위

1. **forest** — 앱 기본값. 사용자가 테마를 안 건드리면 항상 이 화면을 본다. `--bg`/`--panel-2`가 그리드 헤더 초록
   틴트와 맞물리는 효과가 가장 먼저 체감된다.
2. **dark** — 발주자가 "붕뜬다"고 지적한 정황 증거(총괄 실측: "테마를 dark로 바꿔도 상단바·레일바·목록·배경이
   흰색 그대로")가 정확히 이 테마에서 나왔다. 문법색 12종 재선정까지 포함해서 완결.
3. **slate·executive** — dark와 같은 패밀리라 코드 재사용이 크다(§3의 `.sqlt-*` 공통 셀렉터, §2B 파생 로직).
   이 둘을 dark 직후에 붙이면 3개를 사실상 한 커밋 분량으로 끝낼 수 있다. **단, slate의 primary/primary-dark
   근접 문제(§2B 각주, §6)는 스크린샷으로 별도 확인 필요.**
4. **ocean·indigo·modern** — light 패밀리 잔여 3종. 서로 독립적이고 위험도 낮음(전부 AA 통과, §2A).
5. **default** — 이미 og 원본과 거의 동일한 값이 나와서(§6 검증 참고) 사실상 회귀 테스트에 가깝다. 마지막에
   가볍게 확인만.

---

## 6. 정직성 / 캐비어츠 (계산하지 않은 값 없음, 미달은 전부 명시)

- **text-faint/panel (light 5종, 2.88~3.05)**: 3:1 목표에 근접했지만 완전히 통과하지 못했다(모두 3:1 근사치).
  **이건 새로 만든 문제가 아니라 기존 값의 한계다** — 현재 shipped `--text-faint(#93a0b0)` vs 흰 배경 실측
  **2.66**(내가 만든 5개 테마 값보다 오히려 더 나쁘다). `--text-faint`는 이 앱에서 11px 이하 비강조 라벨에만
  쓰이는데, WCAG 정의상 "큰 글자"(18pt/24px 이상, 또는 14pt bold/약 18.7px 이상)가 아니라서 엄밀하게는 4.5:1이
  적용 대상이다 — 그러나 현재도 미달, 내 개정판도 소폭 개선(2.66→2.88~3.05)에 그쳤다. **테마 톤 통일 범위를
  벗어나는 기존 부채로 판단해 이번 라운드에서는 "악화시키지 않음"까지만 보장했다.** 별도 이슈로 분리해
  `--text-faint` 자체를 이 앱 전역에서 재설계하거나, 11px 미만 사용처의 폰트 크기를 키우는 두 가지 해법을
  총괄에게 제안한다.
- **slate의 `--primary` vs `--primary-dark` 근접(§2B)**: `og-primary-dark(#37474f)`가 `og-row-bg`(panel)와
  완전히 같은 색이라, "primary보다 진한 변형"을 만들 방법이 원천적으로 없다(어떤 방향으로 조정해도 panel과
  구분이 안 되거나 primary와 구분이 안 된다). 계산 결과 `--primary(#a3b6bf)`와 `--primary-dark(#a3b5bf)`는
  육안상 거의 동일한 색이 됐다 — **의도된 타협이며 은폐하지 않는다.** 대안: slate에서는 hover/active 상태 구분을
  `--primary-dark`가 아니라 `--accent`나 `--panel-2`로 대체하는 걸 Phase 2에서 검토 권고. 스크린샷 확인 시
  이 지점을 반드시 봐야 한다("검증 필요"로 분류).
- **primary-dark/primary-soft(ocean, 4.27)**: §2A 각주에서 이미 설명 — 0.23 미달, primary-dark 1~2%p darken으로
  해소 가능하나 육안 확인 후 결정 권고.
- **accent/accent-soft(forest, 3.88)**: §2A 각주·§4.3에서 이미 설명 — `.help-support` 텍스트를 forest에서만
  `var(--accent)`로 바꾸지 말 것.
- **color-mix() 브라우저 지원**: §3.3/§4.2/§4.6에서 반복 언급한 전제. 미확인 상태이며, 확인 전에는 리터럴 폴백
  표(§3.3에 이미 계산해 둠)를 쓸 것.
- **default 검증**: `default` 테마의 유도값(`bg #f6f6f8`, `border #e0e2e4`, `text #222630`)이 현재 shipped
  `:root` 원본(`#f6f7f9`/`#dfe3e8`/`#1f2430`)과 거의 일치한다 — 파생 공식이 "이미 잘 맞던 조합"을 크게 흔들지
  않는다는 검증으로 읽었다. `--accent`만 원본(`#6b3fd4`, 임의로 고른 브랜드 보라)과 유도값(`#4c31b9`, primary
  회전)이 육안으로 다르다 — **의도된 변화이며 8개 테마 전체에 일관된 유도 규칙을 적용한 결과**임을 총괄에게
  명시한다. 기존 브랜드 보라를 유지하고 싶다면 light 5종의 `--accent`만 앵커 고정(ok/warn/danger처럼)하는 대안도
  가능 — 이 경우 forest의 accent/accent-soft 미달 문제(3.88)도 함께 없어진다는 점을 참고.

---

## 부록 · 계산 스크립트
이번 세션에서 작성한 Node 계산기(`palette-calc.js`/`palette-build.js`/`sqlt-dark.js`, WCAG 상대휘도·대비비·HSL
회전·이분탐색 기반 최소 조정)는 세션 스크래치패드에 있다(리포에는 없음). 재계산이 필요하면 §1의 공식을 그대로
재구현하면 된다 — mix(a,b,t)는 sRGB 채널 선형 평균, 대비는 표준 WCAG 공식.
