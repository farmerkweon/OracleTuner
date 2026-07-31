# QA-FIX — 런처·포트 결함 수정 (D-01 / D-03 + 실행경로 후속)

| 항목 | 값 |
|---|---|
| 작업 일시 | 2026-07-31 23:31 ~ 2026-08-01 00:05 (KST) |
| 대상 결함 | `docs/panel/QA-PORTABLE.md` 의 **D-01(치명)**, **D-03(높음)**, **D-07(보통)**, **D-10 일부(포트 안내)** |
| 손대지 않은 것 | D-02(총괄이 이미 수정한 `resolveJava()`/`discoverJavaHomes()` — 그대로 보존), `web/**`, `demo/**`·`server/demo-install.js` |
| 고친 파일 | `installer/tray/OracleTunerTray.cs`, `server/index.js`, `server/logger.js`, `server/config.js`(추가만), `tools/build-portable.js` |
| 커밋 | **하지 않음** (지시대로) |
| 로그 | `logs/QA-fix-launcher.log` |
| 스크린샷 | `docs/panel/qa-launcher-shots/` |
| 시험 환경 | 설치판(`C:\APPS\Oracle Tuner`, node pid 18584 / tray pid 21008, **7070**)을 **켠 채로** 시험. 시작·종료·재설치 어느 것도 하지 않았고 작업 종료 시점에도 그대로 살아 있음(확인 완료) |
| 시험 폴더 | `dist\_qa-launcher\A`, `dist\포터블 시험\Oracle Tuner 1.0` — **둘 다 삭제 완료**(`Test-Path` = False) |

---

## 요약

| # | 결함 | 상태 | 한 줄 |
|---|---|---|---|
| D-01 | 포터블 트레이가 설치판과 뮤텍스를 공유 | **해결** | 뮤텍스·이벤트 4종 이름에 **앱 폴더 경로 해시**를 붙여 설치본별로 분리 |
| D-03 | 기본 포트 7070 충돌 + 없는 파일을 가리키는 안내 | **해결** | 기본 포트면 **자동 폴백**, 사용자가 고른 포트면 **정확한 안내 후 실패**. `settings.json` 자동 생성 |
| D-07 | stdout 파이프 단절 시 좀비 | **해결** | 콘솔이 깨지면 **한 번만 알리고 파일 로그로 전환** — 무한 루프 제거 |
| D-10(일부) | README 가 7070 을 고정 안내 | **해결** | 포터블 README 에 "포트에 대하여" 절 추가(자동 폴백·고정법·JSON 예시) |
| — | (신규 발견) 치명 종료 안내가 **로그 파일에 안 남음** | **해결** | `logger.fatal()` = `appendFileSync` + 종료 전 flush 유예 |
| D-06 | 실행 중 폴더 삭제 시 반파 | **미해결(간접 완화)** | 아래 "못 고친 것" 참조 |

---

## D-01 [치명] 포터블 트레이가 설치판과 뮤텍스를 공유해 아무 일도 하지 않는다

### 원인

`installer/tray/OracleTunerTray.cs` 의 단일 인스턴스 판정에 쓰는 커널 오브젝트 이름이
**설치 위치와 무관한 고정 문자열**이었다.

```csharp
private const string MutexName    = "Local\\OracleTunerTray.Instance";   // ← 고정
private const string EvtOpenName  = "Local\\OracleTunerTray.Open";
private const string EvtQuitName  = "Local\\OracleTunerTray.Quit";
private const string EvtStartName = "Local\\OracleTunerTray.Start";
private const string EvtStopName  = "Local\\OracleTunerTray.Stop";
```

그래서 설치판 트레이가 그 뮤텍스를 쥐고 있으면, **다른 폴더의** 포터블도 "중복 실행"으로 판정되어
`SignalEvent(EvtOpen)` 만 보내고 즉시 종료했다. 그 신호를 받은 것은 설치판이므로 설치판 창이 열렸다.
신호 경로(`--quit/--stop/--start`)도 같은 이름을 썼기 때문에 **포터블에 보낸 종료 신호가 설치판을 껐다.**

### 조치

1. **범위 식별자 도입** — `Paths.ScopeId`
   앱 폴더 절대경로를 정규화(`GetFullPath` → 끝 구분자 제거 → `ToLowerInvariant`)한 뒤
   **FNV-1a 64비트** 해시를 16진수 16자리로 만든다.
   · 경로에는 `\`·공백·한글이 들어간다. `\` 는 커널 네임스페이스 구분자라 이름이 통째로 깨지고,
     한글은 문화권별 대소문자 접기 차이가 있어 **경로를 그대로 쓰면 안 된다**.
   · 해시는 직접 구현했다(참조 어셈블리를 늘리지 않는다 — 폐쇄망 in-box `csc.exe` 빌드 전제).
     암호학적 강도가 필요한 용도가 아니다.

2. **뮤텍스 + 이벤트 4개 전부**에 같은 규칙 적용 (한 개라도 빠지면 "중복은 막는데 신호는 남의
   인스턴스로 가는" 최악의 상태가 된다):
   ```csharp
   private static readonly string MutexName = "Local\\OracleTunerTray." + Paths.ScopeId + ".Instance";
   // Open / Quit / Start / Stop 동일
   ```

3. **`WaitForInstanceGone()` 도 같은 범위로** — 이름(`OracleTuner`)만으로 프로세스를 세면
   다른 폴더의 인스턴스까지 세어 `--quit` 이 8초를 꽉 채우고 "사라지지 않았습니다" 오경고를 낸다.
   `MainModule.FileName` 이 자신과 같은 프로세스만 센다(`IsSameImage()`).

4. **로그에 범위를 남긴다** — 중복 판정 로그가 D-01 때는 유일한 흔적이었는데 범위 정보가 없어
   "설치판과 겹쳤다"를 알 수 없었다. 기동 로그와 중복 감지 로그 양쪽에 `scope=` 를 넣었다.

5. **상태 판정 보강(작은 재발 방지)** — "포트가 응답한다"만으로 실행 중이라고 하면,
   **설치판이 7070 에 응답하는 동안 포터블 서버가 죽어 있어도** 포터블 트레이가 "실행 중"으로 보이고
   [열기]가 설치판을 연다(= D-01 의 축소판). 서버가 자기 데이터 폴더에 남기는 `data/runtime.json`
   (pid+port)으로 **우리 서버임을 확인**했을 때만 실행 중으로 본다.

### 검증 근거 (실측)

**① 설치판이 떠 있는 상태에서 포터블 실행 → 각자 뜬다**

```
[2026-07-31 23:40:06] INFO TRAY 트레이 기동 — 로케일=ko 데이터루트=...\_qa-launcher\A 앱폴더=...\_qa-launcher\A scope=9030b12a3909c90b
[2026-07-31 23:40:06] INFO TRAY 서버 기동 요청 pid=53528 port=7070 cmd="...\A\runtime\node.exe" "...\A\server\index.js"
[2026-07-31 23:40:08] INFO TRAY 실제 기동 포트 반영 7070 → 7071 (runtime.json pid=53528)
```
```
프로세스: 21008 C:\APPS\Oracle Tuner\OracleTuner.exe        (설치판, 그대로 생존)
          30232 ...\dist\_qa-launcher\A\OracleTuner.exe      (포터블, HasExited=False)
LISTEN 7070 pid=18584 C:\APPS\Oracle Tuner\runtime\node.exe
LISTEN 7071 pid=53528 ...\_qa-launcher\A\runtime\node.exe
```

**★ 육안 확인 — 트레이 아이콘이 실제로 뜬다**

`docs/panel/qa-launcher-shots/08-final-three-trays.png` — 알림 영역에 **OT 아이콘 3개**가 나란히 있다
(설치판 + 포터블A + 한글경로 포터블). 캡처는 `PrintWindow(TrayNotifyWnd)` 로 떴다.

> ⚠ 솔직히 적는다: 이 VDI 세션은 기본 화면의 작업표시줄이 전체화면 터미널에 가려 있고, Windows 11 이
> 새 트레이 아이콘을 기본으로 **오버플로(∧)에 숨기기** 때문에 그냥 화면을 캡처하면 아이콘이 보이지 않는다.
> 그래서 ⓐ `HKCU\Control Panel\NotifyIconSettings\<키>\IsPromoted=1` 로 세 아이콘을 잠시 작업표시줄에
> 올려 캡처하고 ⓑ 캡처 후 **그 값을 삭제해 원상복구**했다(복구 로그 있음).
> 아이콘 등록 자체도 OS 기록으로 남아 있다 — `NotifyIconSettings` 에 포터블 exe 경로와 설치판 exe 경로가
> **각각 별개 키**로 존재한다.

아이콘의 **툴팁을 UI Automation 으로 읽은 값**(사람이 마우스를 올렸을 때 보는 그 문자열):

```
=== 트레이 툴팁 2026-07-31 23:56:24 ===
   Oracle Tuner — 실행 중 (7080)     ← dist\포터블 시험\Oracle Tuner 1.0
   Oracle Tuner — 실행 중 (7071)     ← dist\_qa-launcher\A
   Oracle Tuner — 실행 중 (7070)     ← C:\APPS\Oracle Tuner (설치판)
세 인스턴스 HTTP:  7070 → 200(28349B) / 7071 → 200(28316B) / 7080 → 200(28316B)
```

**② 포터블에 `--quit` → 포터블만 꺼진다**

```
--quit 전:  21008(설치판)  30232(포터블A)  54688(한글경로)
            LISTEN 7070 pid=18584 / 7071 pid=53528 / 7080 pid=54524
--quit 실행: 종료코드=0, 소요 4487ms
--quit 후:  21008(설치판)  54688(한글경로)          ← 포터블A 만 사라짐
            LISTEN 7070 pid=18584 / 7080 pid=54524  ← 7071 만 사라짐
[2026-07-31 23:47:47] DONE TRAY 트레이 종료 — 자식·손자 프로세스 정리 완료
[2026-07-31 23:47:47] INFO TRAY 기존 인스턴스 종료 확인 (3000ms)   ← 8000ms 를 꽉 채우지 않았다(3번 조치의 효과)
```

**`--stop` / `--start` 도 같은 범위로 동작한다** (지시하신 "신호 경로도 같은 규칙" 검증):

```
--stop 전 : LISTEN 7080 pid=54524 / 7070 pid=18584
--stop 후 : LISTEN 7070 pid=18584                 ← 한글경로 포터블만 정지, 설치판 무사
--start 후: [23:50:50] INFO TRAY 신호 수신: 시작(--start) → 서버 기동 pid=52320
            [23:50:51] INFO TRAY 실제 기동 포트 반영 7070 → 7071
설치판 트레이 21008 생존 확인
```

**③ 같은 폴더에서 두 번 실행 → 중복 방지 여전히 동작**

```
두 번째 실행 pid=31112 HasExited=True     ← 즉시 종료(의도한 동작)
[2026-07-31 23:46:29] INFO TRAY 중복 실행 감지(같은 앱폴더 ...\_qa-launcher\A, scope=9030b12a3909c90b) — 기존 인스턴스에 '열기'를 요청하고 종료합니다.
[2026-07-31 23:46:29] INFO TRAY 신호 수신: 열기
[2026-07-31 23:46:29] INFO TRAY 브라우저 열기 요청: explorer.exe "http://127.0.0.1:7071/"   ← 설치판 7070 이 아니라 자기 포트
```

**④ 한글+공백 경로에서도 동작**

```
[2026-07-31 23:46:45] INFO TRAY 트레이 기동 — ... 앱폴더=E:\...\dist\포터블 시험\Oracle Tuner 1.0 scope=15ed7f63114dc15a
```
`scope` 가 A 폴더(9030b12a…)와 다르다 → 서로 독립. 기동·포트·화면 모두 정상(HTTP 200).

**⑤ 자기 서버가 못 뜬 경우 남의 포트를 자기 것이라고 하지 않는다** (5번 조치 검증)
사용 중인 포트를 명시 지정해 서버를 일부러 실패시킨 뒤:
```
[23:52:34] INFO TRAY 상태 변화 Stopped → Running (자식=생존, 포트7071=응답, 확인=없음(폴백))
[23:52:36] INFO TRAY 상태 변화 Running → Stopped (자식=없음, 포트7071=응답, 확인=없음(폴백))
툴팁: "Oracle Tuner — 정지됨"      ← 7071 은 응답 중이지만(다른 인스턴스) 실행 중이라고 하지 않는다
```

---

## D-03 [높음] 기본 포트가 설치판과 동일(7070) + 안내가 없는 파일을 가리킨다

### 원인

* `server/index.js` 는 `EADDRINUSE` 를 받으면 **무조건 `process.exit(1)`** 했다.
  (`server/port-utils.js` 의 `findAvailablePort()` 는 설치 위저드만 쓰고 기동 경로는 쓰지 않았다.)
* 안내는 `<앱폴더>\config\settings.json` 을 고치라고 했지만 **앱이 그 파일을 만들지 않았다.**
  포터블 해제 직후 `config\` 에는 `.gitkeep` 뿐이다. JSON 형식 예시도 없었다.

### 조치 — 판단과 근거

**규칙을 둘로 나눴다** (`resolvePort()` 주석에 근거를 그대로 남겼다):

| 상황 | 판정 | 동작 |
|---|---|---|
| 사용자가 포트를 고르지 않음(= 기본값 7070) | **미지정** | 다음 가용 포트로 **자동 폴백**(7070→7071→7080→8070→8080→9070). 화면·로그에 크게 알린다 |
| `--port` / `ORACLE_TUNER_PORT` / `settings.json` 에 **기본값과 다른 값** | **명시 지정** | 말없이 바꾸지 않는다. **실패시키되 안내를 정확히** |

* "설치판+포터블 동시 보유"는 홍보글이 둘 다 링크하는 **정상 시나리오**다. 말없이 죽는 것보다
  뜨는 편이 낫다.
* 반대로 사용자가 고른 포트는 북마크·방화벽 규칙이 걸려 있을 수 있어 **몰래 옮기면 안 된다.**
* **"settings.json 에 값이 있으면 곧 명시 지정"으로 보지 않은 이유**: 설정 화면에서 [저장]을 한 번만
  눌러도 전체 스키마가 기록되어 `server.port: 7070` 이 적힌다(QA 항목 14 실측). 그것을 "7070 을
  고집한다"로 읽으면 포터블은 다시 못 뜬다. 그래서 **기본값과 다른 값일 때만** 명시 지정으로 본다.
  · 트레이드오프: 설치 위저드에서 **일부러 7070 을 고른** 사용자도 충돌 시 자동 폴백된다.
    다만 그 사실을 로그·콘솔·트레이 툴팁에 모두 알리므로 "모르게 바뀌는" 상태는 아니다.

**실제로 뜬 포트를 정확히 알린다**
* 콘솔: `※ 포트 7070 가 사용 중이라 7071 번으로 띄웁니다.`
* 로그: `듣는 중: http://127.0.0.1:7071/ (요청 포트=7070/기본값, 실제=7071)`
* 트레이: 서버가 `<데이터루트>\data\runtime.json` 에 `{pid, port, host, url, startedAt}` 를 쓰고,
  트레이가 2초 주기로 읽어 **툴팁과 [열기] 주소**를 실제 포트로 맞춘다(정상 종료 시 파일 삭제,
  기동 직전에도 지난 찌꺼기를 지운다).

**안내가 가리키는 파일이 반드시 존재하게**
* `config.ensureSettingsFile()` — 기동 시 `settings.json` 이 없으면 **기본값 그대로 만든다**(멱등).
* 오류 문구에 **붙여넣을 수 있는 JSON 예시**와 1회용 대안(`--port`)을 넣었다.
* `OracleTuner.bat` 이 인자를 그대로 넘기도록 `%*` 추가(`tools/build-portable.js`).

### 검증 근거 (실측)

**자동 폴백 (기본 포트)**
```
[2026-07-31 23:40:06] INFO server 실행 모드=portable 앱폴더=...\A 데이터루트=...\A
[2026-07-31 23:40:06] INFO server 설정 파일이 없어 기본값으로 만들었습니다: ...\A\config\settings.json
[2026-07-31 23:40:07] WARN server 포트 7070 가 이미 사용 중이라 7071 로 바꿔 띄웁니다(기본 포트라 자동으로 옮겼습니다. 고정하려면 ...\A\config\settings.json 의 server.port 를 지정하세요).
[2026-07-31 23:40:07] INFO server 듣는 중: http://127.0.0.1:7071/ (요청 포트=7070/기본값, 실제=7071)
```
```json
// ...\A\data\runtime.json
{ "pid": 53528, "port": 7071, "host": "127.0.0.1", "url": "http://127.0.0.1:7071/", "startedAt": "2026-07-31 23:40:07" }
```
7070·7071 이 모두 찬 상태에서 세 번째 인스턴스는 **7080** 으로 갔다(한글경로 판, 23:46:45).

**명시 지정(사용 중) → 실패 + 정확한 안내**
```
exit=1
[2026-07-31 23:54:38] ERROR server 포트 7071 가 이미 사용 중입니다(settings.json 로 지정된 포트라 임의로 바꾸지 않았습니다).
  · 다른 포트로 띄우려면 E:\...\A\config\settings.json 를 열어 server.port 를 바꾼 뒤 다시 실행하세요:
      {
        "server": {
          "port": 7072
        }
      }
  · 한 번만 다른 포트로 띄우려면: OracleTuner.bat --port 7072
  · 그 포트를 쓰는 프로그램이 Oracle Tuner 자신일 수도 있습니다(설치판이 이미 떠 있는 경우).
```
· `--port 7070`(사용 중) 도 같은 경로로 실패하며 문구가 `(--port 로 지정된 포트라 …)` 로 바뀐다.
· `--port 7099`(빈 포트) → `LISTEN 7099`, `runtime.json` 도 7099 로 기록됨.
· 안내가 가리키는 `settings.json` 은 **그 시점에 실제로 존재**한다(기동 첫 줄에서 만든다).

---

## (신규 발견) 치명 종료 안내가 로그 파일에 한 줄도 안 남던 문제

검증 중 발견했다. `logger.js` 의 파일 스트림은 비동기라 `log.error(...); process.exit(1)` 로 쓰면
**버퍼가 비워지기 전에 프로세스가 사라져 `server.log` 가 0바이트**가 된다(실측). 트레이로 띄우면
콘솔도 없으므로 **사용자에게도 로그에도 아무 흔적이 없는** 가장 나쁜 상태다. D-01 이 "로그 한 줄"로
겨우 잡혔던 것을 생각하면 그냥 넘길 수 없었다.

* 조치 ① `logger.fatal()` — `fs.appendFileSync` 로 **동기 기록**.
* 조치 ② 종료 전 250ms 유예(`exitAfterFlush`) — 앞서 쌓인 기동·진단 로그의 맥락도 함께 남긴다.
* 검증 — 재현 후 `server.log` 에 치명 안내 + 기동/진단 8줄이 모두 남는 것을 확인했다.
  (동기 기록이 비동기 버퍼보다 먼저 나가서 **치명 줄이 파일 맨 위**에 오는 경우가 있다. 타임스탬프로
  순서를 알 수 있으므로 그대로 두었다.)

---

## D-07 [보통] stdout 파이프가 끊기면 서버가 좀비가 된다

### 원인
`logger.write()` 가 `process.stdout.write` 로 EPIPE 를 내면 → `index.js` 의 `uncaughtException`
핸들러가 그것을 **다시 로거로 기록** → 또 stdout 에 써서 같은 예외 재발생. 무한 반복 동안 이벤트
루프가 잡혀 포트는 LISTEN 인데 `/api/*` 가 전부 무응답인 좀비가 된다.

### 조치
* `logger.js` — `process.stdout/stderr` 에 `error` 핸들러를 걸고, 한 번 깨지면 **콘솔 출력을 영구 차단**
  (`disableConsole`). 파일 로그는 그대로 남으므로 진단 능력은 유지된다. 끊긴 사유를 한 줄 남긴다.
* `index.js` — `uncaughtException` 이 `EPIPE`/`ERR_STREAM_DESTROYED` 면 로거를 다시 부르지 않는다.

### 검증 근거
파이프의 읽는 쪽을 끊고, 그 뒤 **로그를 실제로 쓰게 만들어**(404 20회) 확인:
```
기동 후:            /api/config → 200 (72ms)
>> 파이프 단절
WARN 20회 유발 후:  /api/config → 200 (72ms)
3초 뒤:             /api/config → 200 (70ms)
자식 살아있음: true
```
```
server.log 총 48줄 / EPIPE 줄 1개 / 404 WARN 20줄 모두 기록됨
[2026-07-31 23:49:52] WARN logger 콘솔 출력이 끊겨(EPIPE) 이후로는 파일 로그만 남깁니다.
```
수정 전 증상(무한 EPIPE 반복 + 전 API 25초 타임아웃)은 **재현되지 않는다.**

---

## D-10 [낮음] 중 포트 안내 부분

`tools/build-portable.js` 의 README 생성부에 **"포트에 대하여"** 절을 추가했다 —
자동 폴백 규칙과 후보 순서, 실제 주소 확인 방법(트레이 툴팁·`logs\server.log`), 고정하는 법(JSON 예시),
`--port` 1회용 사용법, "설치판과 포터블을 함께 써도 된다"는 안내.
(D-10 의 나머지 두 건 — DB 접속 모달 `[삭제]` 버튼 활성, 비밀번호 칸 복원 — 은 `web/**` 담당자 영역이라
손대지 않았다.)

---

## 못 고친 것 / 손대지 않은 것

* **D-06 [보통] 실행 중 폴더를 지우면 반쯤 부서진 채 남는다** — **코드로 고치지 않았다.**
  윈도우는 잠기지 않은 파일부터 지워버리므로 앱이 막을 방법이 사실상 없다(전 파일을 잠그는 것은
  USB 이동성·백업을 해치는 더 나쁜 처방이다). 다만 **연쇄 원인은 사라졌다**: D-06 이 위험했던 이유는
  D-01 때문에 **트레이 아이콘이 없어서 실행 중인지 알 방법이 없었기** 때문인데, 이제 아이콘이 정상적으로
  뜨고 툴팁에 `실행 중 (포트)` 가 보이며 [종료] 메뉴에 도달할 수 있다.
* **D-02** — 총괄이 이미 고친 부분(`server/config.js` 의 `runtime/jre` 후보 추가)을 **그대로 보존**했다.
  내가 만진 `config.js` 변경은 `ensureSettingsFile()` 추가와 export 한 줄뿐이다.
* **D-04 / D-05 / D-08 / D-09** — 화면·i18n·그리드 영역이라 손대지 않았다(다른 담당자).

---

## 남은 할 일 (총괄용)

1. **배포본 재빌드가 필요하다.** 트레이 `OracleTuner.exe` 와 README·`.bat` 는 빌드 산출물이다.
   `node tools/build-portable.js --both`, `node tools/build-installer.js` 를 다시 돌려야 이 수정이
   사용자에게 나간다. (트레이 단독 빌드는 `node tools/build-tray.js` — 이번 작업 중 3회 성공, 44KB.)
2. **설치판도 새 트레이로 교체될 때 이득을 본다.** 이번 시험에서 설치판은 **옛 트레이(고정 이름)** 인
   채였고, 그래도 포터블이 정상 동작했다(새 이름이 옛 이름과 겹치지 않으므로). 다만 옛 설치판 두 개를
   서로 다른 폴더에 두는 조합은 여전히 충돌한다 — 재빌드·재배포로만 해소된다.
3. `web/js/views/settings.js` 의 포트 표시는 **설정값**이지 실제 포트가 아니다(자동 폴백 시 어긋난다).
   `web/**` 담당자 영역이라 손대지 않았다. `runtime.json` 또는 `/api/config` 에 실제 포트를 실어
   화면에도 보여주면 좋겠다.

## 뒷정리 확인

* 시험 폴더 `dist\_qa-launcher\`, `dist\포터블 시험\` — **삭제 완료**(`Test-Path` = False, 잠긴 파일 없음).
* 레지스트리 `IsPromoted` 임시 값 3건 — **삭제해 원상복구 완료**.
* 설치판 — **시작·종료·재설치 어느 것도 하지 않았다.** 작업 종료 시점 확인:
  `21008 OracleTuner (C:\APPS\Oracle Tuner)`, `18584 node`, `LISTEN 7070 pid=18584` 그대로 생존.
* 테스트 스위트 `node test/run-tests.js` — **163 통과 / 0 실패** (수정 전후 동일).
