// Oracle Tuner — 트레이 상주 런처
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 이게 필요한가 (2026-07-31 발주자 실사용 사고)
//
//   기존 런처(OracleTuner.vbs)는 node.exe 를 창 숨김으로 띄우고 그대로 사라졌다.
//   그 결과:
//     ① 사용자는 앱이 떠 있는지조차 알 수 없다 (화면에 아무 표시가 없다).
//     ② 끌 방법이 없다. 작업관리자에서 node.exe 를 찾아 죽이는 수밖에 없었다.
//     ③ 그래서 제거/재설치 때 node.exe 가 설치 폴더 파일을 잡고 있어 삭제가 실패했다.
//        (실제로 오늘 이 시나리오로 제거가 실패했다.)
//
//   이 프로그램은 그 세 가지를 정면으로 해결한다.
//     · 트레이 아이콘으로 "떠 있음"을 보여준다.
//     · 메뉴로 시작/정지/종료할 수 있다.
//     · 종료 시 자식(node)뿐 아니라 **손자(java 브리지)까지** 확실히 정리한다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 오늘 터진 함정 3개와 이 코드의 재발 방지 근거
//
//   [함정 1] SW_HIDE 상속
//     OracleTuner.vbs 가 `WScript.Shell.Run cmd, 0`(SW_HIDE)로 node 를 띄우면,
//     그 "창 숨김" 상태가 자식으로 상속된다. 그래서 node 가 `start "" <url>` 로 연
//     브라우저까지 숨겨진 창으로 떠서 화면에 아무것도 안 나타났다.
//     → 이 앱은 브라우저를 열 때 **반드시 explorer.exe 에 위임한다**.
//       이미 떠 있는 셸이 대신 열어주므로 숨김 상태를 물려받지 않는다.
//       (server/index.js 의 openBrowser() 주석과 같은 근거다.)
//     ⚠ explorer.exe 는 성공해도 종료코드 1 을 반환하는 일이 흔하다.
//       종료코드로 실패를 판정하지 말 것.
//
//   [함정 2] 손자 프로세스 잔존
//     node 는 server/bridge.js 를 통해 **java 를 손자 프로세스로 띄운다.**
//     node 만 죽이면 java 가 고아가 되어 그대로 남는다. 남은 java 가 java/lib 의
//     jar 파일을 잡고 있으면 제거가 또 실패한다.
//     → **Job Object** 로 묶는다. JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE 를 걸어두면
//       job 핸들이 닫히는 순간(=이 트레이 앱이 어떤 이유로든 죽는 순간, 작업관리자
//       강제종료·로그오프·크래시 포함) 커널이 job 안의 **모든 프로세스를 통째로**
//       정리한다. C# 의 finally 나 이벤트 핸들러에 의존하지 않는 유일하게 확실한 방법이다.
//
//   [함정 3] 실행 중 제거 실패
//     → 설치 스크립트(OracleTuner.iss)가 제거/재설치 직전에 `OracleTuner.exe --quit`
//       를 호출한다. 이 앱은 명명된 이벤트로 그 신호를 받아 스스로 정리 후 종료한다.
//       (아래 EVT_QUIT 참조)
//
// ─────────────────────────────────────────────────────────────────────────────
// 빌드 (tools/build-tray.js 가 자동으로 한다)
//
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
//     /target:winexe  ← 콘솔 창이 절대 뜨지 않게 한다. /target:exe 로 바꾸지 말 것.
//     /win32icon:installer\OracleTuner.ico
//     /reference:System.Windows.Forms.dll /reference:System.Drawing.dll
//
//   ⚠ 이 컴파일러는 **C# 5 까지만** 지원한다(폐쇄망 전제로 in-box 컴파일러를 쓴다).
//     문자열 보간($"..."), null 조건 연산자(?.), nameof, 식 본문 멤버(=>)를 쓰면
//     컴파일이 깨진다. string.Format / 명시적 null 검사로 쓸 것.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Oracle Tuner")]
[assembly: AssemblyDescription("Oracle Tuner tray launcher")]
[assembly: AssemblyCompany("foxnail.kr")]
[assembly: AssemblyProduct("Oracle Tuner")]
[assembly: AssemblyCopyright("Copyright (C) 2026 foxnail.kr")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace OracleTuner
{
    // ═════════════════════════════════════════════════════════════════════════
    // 다국어
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 트레이 UI 문구 사전. 앱 본체(web/js/i18n.js)와 **같은 4로케일**(ko/en/ja/zh)을 쓴다.
    ///
    /// 문자열을 코드 곳곳에 하드코딩하지 않고 여기 한 곳에 모은다 —
    /// 나중에 키를 추가할 때 이 파일만 보면 되도록.
    /// 키가 현재 로케일에 없으면 en → 키 자체 순으로 폴백한다(빈 메뉴를 만들지 않는다).
    /// </summary>
    internal static class Strings
    {
        /// <summary>지원 로케일. 이 순서가 폴백 우선순위와는 무관하다.</summary>
        public static readonly string[] Locales = new string[] { "ko", "en", "ja", "zh" };

        // 한 줄에 4개 언어를 모아 관리한다(i18n.js 와 같은 방식 — 누락을 눈으로 잡기 쉽게).
        // 순서: ko, en, ja, zh
        private static readonly Dictionary<string, string[]> M = new Dictionary<string, string[]>
        {
            // ── 컨텍스트 메뉴 ──
            { "menu.open",     new string[] { "열기",        "Open",      "開く",       "打开"     } },
            { "menu.start",    new string[] { "시작",        "Start",     "開始",       "启动"     } },
            { "menu.stop",     new string[] { "정지",        "Stop",      "停止",       "停止"     } },
            { "menu.quit",     new string[] { "종료",        "Quit",      "終了",       "退出"     } },

            // ── 상태 문구 (툴팁에 들어간다) ──
            { "state.running", new string[] { "실행 중",     "Running",   "実行中",     "运行中"   } },
            { "state.stopped", new string[] { "정지됨",      "Stopped",   "停止済み",   "已停止"   } },
            { "state.starting",new string[] { "시작 중",     "Starting",  "起動中",     "启动中"   } },
            { "state.stopping",new string[] { "정지 중",     "Stopping",  "停止中",     "停止中"   } },

            // ── 툴팁 서식 ──
            // {0}=상태, {1}=포트.  NotifyIcon.Text 는 63자 제한이 있으니 짧게 유지할 것.
            { "tip.running",   new string[] { "Oracle Tuner — {0} ({1})",
                                              "Oracle Tuner — {0} ({1})",
                                              "Oracle Tuner — {0} ({1})",
                                              "Oracle Tuner — {0} ({1})" } },
            { "tip.stopped",   new string[] { "Oracle Tuner — {0}",
                                              "Oracle Tuner — {0}",
                                              "Oracle Tuner — {0}",
                                              "Oracle Tuner — {0}" } },

            // ── 오류 메시지 ──
            { "err.title",     new string[] { "Oracle Tuner", "Oracle Tuner", "Oracle Tuner", "Oracle Tuner" } },
            { "err.noNode",    new string[] { "Node 런타임을 찾을 수 없습니다:\n{0}",
                                              "Node runtime not found:\n{0}",
                                              "Node ランタイムが見つかりません:\n{0}",
                                              "找不到 Node 运行时:\n{0}" } },
            { "err.noServer",  new string[] { "서버 파일을 찾을 수 없습니다:\n{0}",
                                              "Server file not found:\n{0}",
                                              "サーバーファイルが見つかりません:\n{0}",
                                              "找不到服务器文件:\n{0}" } },
            { "err.startFail", new string[] { "서버를 시작하지 못했습니다.\n{0}",
                                              "Failed to start the server.\n{0}",
                                              "サーバーを起動できませんでした。\n{0}",
                                              "无法启动服务器。\n{0}" } },
            { "err.stopFail",  new string[] { "서버를 정지하지 못했습니다.\n{0}",
                                              "Failed to stop the server.\n{0}",
                                              "サーバーを停止できませんでした。\n{0}",
                                              "无法停止服务器。\n{0}" } },
            { "err.openFail",  new string[] { "브라우저를 열지 못했습니다.\n{0}",
                                              "Failed to open the browser.\n{0}",
                                              "ブラウザーを開けませんでした。\n{0}",
                                              "无法打开浏览器。\n{0}" } }
        };

        /// <summary>현재 로케일. Program.Main 이 결정해서 한 번만 설정한다.</summary>
        public static string Locale = "en";

        private static int IndexOfLocale(string loc)
        {
            for (int i = 0; i < Locales.Length; i++)
                if (Locales[i] == loc) return i;
            return 1; // en
        }

        /// <summary>키에 해당하는 현재 로케일 문구. 없으면 en, 그래도 없으면 키 자체.</summary>
        public static string T(string key)
        {
            string[] row;
            if (!M.TryGetValue(key, out row)) return key;
            int i = IndexOfLocale(Locale);
            if (i < row.Length && !string.IsNullOrEmpty(row[i])) return row[i];
            if (row.Length > 1 && !string.IsNullOrEmpty(row[1])) return row[1];
            return key;
        }

        /// <summary>서식 문구. string.Format 실패(잘못된 서식)로 앱이 죽지 않게 감싼다.</summary>
        public static string T(string key, params object[] args)
        {
            string s = T(key);
            try { return string.Format(CultureInfo.InvariantCulture, s, args); }
            catch (FormatException) { return s; }
        }

        /// <summary>진단용 — 현재 로케일의 메뉴 문자열 전부를 한 줄로 만든다(tray.log 증빙).</summary>
        public static string MenuDump()
        {
            return string.Format("open='{0}' start='{1}' stop='{2}' quit='{3}' running='{4}' stopped='{5}'",
                T("menu.open"), T("menu.start"), T("menu.stop"), T("menu.quit"),
                T("state.running"), T("state.stopped"));
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 경로 / 설정
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// 경로 해석. server/paths.js 의 모드 판정을 **그대로 흉내낸다** —
    /// 트레이가 보는 settings.json 과 node 가 보는 settings.json 이 달라지면
    /// 포트가 어긋나 "열기"가 엉뚱한 주소를 연다.
    ///
    /// 판정(paths.js resolveMode 와 동일 순서):
    ///   1) portable.marker 가 앱 폴더에 있으면 → 포터블: 데이터도 앱 폴더 상대경로
    ///   2) .git 이 있으면 → 개발: 마찬가지로 앱 폴더 상대경로
    ///   3) 그 외 → 설치: %LOCALAPPDATA%\OracleTuner
    /// (paths.js 의 ORACLE_TUNER_DATA_DIR 환경변수 분기는 트레이에서도 존중한다.)
    /// </summary>
    internal static class Paths
    {
        public static readonly string AppDir =
            Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        public static readonly string NodeExe  = Path.Combine(AppDir, Path.Combine("runtime", "node.exe"));
        public static readonly string ServerJs = Path.Combine(AppDir, Path.Combine("server", "index.js"));
        public static readonly string IconFile = Path.Combine(AppDir, "OracleTuner.ico");

        public static readonly string DataRoot = ResolveDataRoot();

        private static string ResolveDataRoot()
        {
            string env = Environment.GetEnvironmentVariable("ORACLE_TUNER_DATA_DIR");
            if (!string.IsNullOrEmpty(env)) return Path.GetFullPath(env);
            if (File.Exists(Path.Combine(AppDir, "portable.marker"))) return AppDir;
            if (Directory.Exists(Path.Combine(AppDir, ".git"))) return AppDir;
            string lad = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(lad, "OracleTuner");
        }

        public static string SettingsFile
        {
            get { return Path.Combine(Path.Combine(DataRoot, "config"), "settings.json"); }
        }

        public static string LogsDir
        {
            get { return Path.Combine(DataRoot, "logs"); }
        }

        public static string TrayLog
        {
            get { return Path.Combine(LogsDir, "tray.log"); }
        }
    }

    /// <summary>
    /// settings.json 읽기.
    ///
    /// ⚠ JSON 파서를 쓰지 않고 정규식으로 두 값만 뽑는다. 왜:
    ///   · 이 파일은 우리 설치 스크립트(OracleTuner.iss WriteSettings)와 앱이 쓰는 것이라
    ///     형식이 통제되어 있다.
    ///   · .NET Framework in-box 에서 쓸 수 있는 JSON 파서(JavaScriptSerializer 등)를
    ///     끌어오면 참조 어셈블리가 늘어난다. 폐쇄망 빌드는 참조가 적을수록 안전하다.
    ///   · 값을 못 읽어도 기본값으로 동작해야 한다(포트 7070). 파싱 실패가 앱 기동을
    ///     막으면 안 된다.
    /// 형식이 크게 바뀌면 이 두 정규식만 고치면 된다.
    /// </summary>
    internal static class Settings
    {
        public const int DefaultPort = 7070;

        private static string ReadAllTextSafe(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                return File.ReadAllText(path, Encoding.UTF8);
            }
            catch (Exception) { return null; }
        }

        /// <summary>server.port. 읽지 못하면 7070.</summary>
        public static int ReadPort()
        {
            string txt = ReadAllTextSafe(Paths.SettingsFile);
            if (txt == null) return DefaultPort;
            Match m = Regex.Match(txt, "\"port\"\\s*:\\s*(\\d{1,5})");
            if (!m.Success) return DefaultPort;
            int p;
            if (!int.TryParse(m.Groups[1].Value, out p)) return DefaultPort;
            if (p < 1 || p > 65535) return DefaultPort;
            return p;
        }

        /// <summary>ui.locale. 없으면 null(호출자가 시스템 문화권으로 폴백한다).</summary>
        public static string ReadLocale()
        {
            string txt = ReadAllTextSafe(Paths.SettingsFile);
            if (txt == null) return null;
            Match m = Regex.Match(txt, "\"locale\"\\s*:\\s*\"([A-Za-z\\-]{2,10})\"");
            if (!m.Success) return null;
            return m.Groups[1].Value;
        }
    }

    /// <summary>
    /// 트레이 전용 로그. %LOCALAPPDATA%\OracleTuner\logs\tray.log (포터블은 앱폴더\logs).
    ///
    /// 형식은 프로젝트 규약을 따른다: [YYYY-MM-DD HH:MM:SS] LEVEL TRAY 메시지
    /// 트레이는 창이 없어서 문제가 생겨도 화면에 아무것도 못 남긴다. 로그가 유일한 증거다.
    /// 로그 쓰기가 실패해도 앱은 계속 돌아야 하므로 모든 예외를 삼킨다.
    /// </summary>
    internal static class Log
    {
        private static readonly object Gate = new object();

        public static void Write(string level, string msg)
        {
            lock (Gate)
            {
                try
                {
                    Directory.CreateDirectory(Paths.LogsDir);
                    string line = string.Format("[{0}] {1} TRAY {2}",
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                        level, msg);
                    File.AppendAllText(Paths.TrayLog, line + Environment.NewLine, new UTF8Encoding(false));
                }
                catch (Exception) { /* 로그 실패로 앱을 죽이지 않는다 */ }
            }
        }

        public static void Info(string m)  { Write("INFO",  m); }
        public static void Warn(string m)  { Write("WARN",  m); }
        public static void Error(string m) { Write("ERROR", m); }
        public static void Done(string m)  { Write("DONE",  m); }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Job Object — 손자 프로세스(java)까지 확실히 정리하는 장치
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Windows Job Object 래퍼.
    ///
    /// ★ 이 클래스가 이번 작업의 핵심이다.
    ///
    ///   node 는 java 브리지를 손자 프로세스로 띄운다. 트레이가 node 만 죽이면
    ///   java 가 고아로 남고, 남은 java 가 java/lib/*.jar 를 잡아 제거가 실패한다
    ///   (2026-07-31 실제 사고).
    ///
    ///   JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE 를 건 job 에 node 를 넣어두면
    ///   node 가 만드는 모든 자손이 자동으로 같은 job 에 들어간다. 그리고
    ///   **job 핸들이 닫히는 순간 커널이 job 안 모든 프로세스를 종료한다.**
    ///
    ///   여기서 "핸들이 닫히는 순간"에는 이런 경우가 모두 포함된다:
    ///     · 우리가 Dispose() 를 호출했을 때 (정상 종료)
    ///     · 트레이 프로세스가 정상 종료됐을 때 (핸들이 자동 정리됨)
    ///     · 트레이가 **작업관리자에서 강제 종료**되거나 크래시했을 때
    ///     · 로그오프/셧다운으로 프로세스가 끊겼을 때
    ///   즉 C# 의 finally 나 이벤트 핸들러에 의존하지 않는다. 그것이 이 방식을 고른 이유다.
    ///   (finally 는 강제 종료 시 실행되지 않는다. 그래서 오늘 프로세스가 남았다.)
    ///
    /// 참고: Windows 8 / Server 2012 부터 job 중첩이 허용되므로, 이미 다른 job 안에서
    /// 실행 중이더라도(예: 일부 CI·컨테이너 환경) AssignProcessToJobObject 가 실패하지 않는다.
    /// 그 아래 버전에서 실패하면 로그에 남기고 taskkill /T 폴백으로 넘어간다(치명적이지 않다).
    /// </summary>
    internal sealed class JobObject : IDisposable
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass,
            IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const int  JobObjectExtendedLimitInformation = 9;
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        private struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long    PerProcessUserTimeLimit;
            public long    PerJobUserTimeLimit;
            public uint    LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint    ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint    PriorityClass;
            public uint    SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        private IntPtr _handle;

        public bool IsValid { get { return _handle != IntPtr.Zero; } }

        public JobObject()
        {
            _handle = CreateJobObject(IntPtr.Zero, null); // 이름 없는 job — 다른 프로세스와 공유하지 않는다
            if (_handle == IntPtr.Zero)
            {
                Log.Warn("Job Object 생성 실패 (win32=" + Marshal.GetLastWin32Error()
                    + "). 종료 시 taskkill /T 폴백으로 정리합니다.");
                return;
            }

            JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            int len = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr p = Marshal.AllocHGlobal(len);
            try
            {
                Marshal.StructureToPtr(info, p, false);
                if (!SetInformationJobObject(_handle, JobObjectExtendedLimitInformation, p, (uint)len))
                {
                    Log.Warn("Job Object 설정 실패 (win32=" + Marshal.GetLastWin32Error() + ")");
                }
            }
            finally { Marshal.FreeHGlobal(p); }
        }

        /// <summary>프로세스를 job 에 넣는다. 이후 그 프로세스의 모든 자손이 자동으로 같은 job 에 들어간다.</summary>
        public bool Assign(Process proc)
        {
            if (_handle == IntPtr.Zero || proc == null) return false;
            bool ok = AssignProcessToJobObject(_handle, proc.Handle);
            if (!ok) Log.Warn("Job 편입 실패 pid=" + proc.Id + " (win32=" + Marshal.GetLastWin32Error() + ")");
            return ok;
        }

        /// <summary>job 안의 모든 프로세스를 즉시 종료한다(node + 손자 java 전부).</summary>
        public void TerminateAll()
        {
            if (_handle == IntPtr.Zero) return;
            if (!TerminateJobObject(_handle, 0))
                Log.Warn("TerminateJobObject 실패 (win32=" + Marshal.GetLastWin32Error() + ")");
        }

        public void Dispose()
        {
            if (_handle == IntPtr.Zero) return;
            // 핸들을 닫는 것만으로도 KILL_ON_JOB_CLOSE 가 발동해 job 안 프로세스가 정리된다.
            CloseHandle(_handle);
            _handle = IntPtr.Zero;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 서버(node) 프로세스 관리
    // ═════════════════════════════════════════════════════════════════════════

    internal enum ServerState { Stopped, Starting, Running, Stopping }

    /// <summary>
    /// node 서버 프로세스의 기동/정지/상태 확인.
    ///
    /// 상태 판정은 **두 가지를 함께** 본다:
    ///   ① 우리가 띄운 자식 프로세스가 살아 있는가 (Process.HasExited)
    ///   ② 포트가 실제로 응답하는가 (TCP connect)
    /// ②가 필요한 이유: 자식은 살아 있어도 포트 충돌(EADDRINUSE)로 서버가
    /// 죽는 중일 수 있고, 반대로 예전 세션의 node 가 남아 포트를 잡고 있을 수도 있다.
    /// 사용자에게 보여줄 "실행 중"은 **실제로 접속되는 상태**여야 한다.
    /// </summary>
    internal sealed class ServerController : IDisposable
    {
        private Process _proc;
        private JobObject _job;
        private readonly object _gate = new object();

        public int Port { get; private set; }

        public ServerController()
        {
            Port = Settings.ReadPort();
        }

        /// <summary>우리가 띄운 자식이 살아 있는가.</summary>
        public bool ChildAlive
        {
            get
            {
                lock (_gate)
                {
                    if (_proc == null) return false;
                    try { return !_proc.HasExited; }
                    catch (Exception) { return false; }
                }
            }
        }

        /// <summary>포트가 응답하는가(127.0.0.1 로컬 연결이라 실패 판정이 즉시 난다).</summary>
        public bool PortResponds()
        {
            try
            {
                using (TcpClient c = new TcpClient())
                {
                    IAsyncResult ar = c.BeginConnect("127.0.0.1", Port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(400, false);
                    if (!ok) return false;
                    c.EndConnect(ar);
                    return c.Connected;
                }
            }
            catch (Exception) { return false; }
        }

        public string Url
        {
            get { return "http://127.0.0.1:" + Port.ToString(CultureInfo.InvariantCulture) + "/"; }
        }

        /// <summary>
        /// 서버를 띄운다. 이미 떠 있으면 아무것도 하지 않는다.
        /// </summary>
        /// <returns>오류 메시지. 성공이면 null.</returns>
        public string Start()
        {
            lock (_gate)
            {
                if (_proc != null)
                {
                    bool alive;
                    try { alive = !_proc.HasExited; } catch (Exception) { alive = false; }
                    if (alive) return null;
                    CleanupLocked();
                }

                // 포트를 매번 다시 읽는다 — 사용자가 설정을 바꿨을 수 있다.
                Port = Settings.ReadPort();

                if (!File.Exists(Paths.NodeExe))
                {
                    Log.Error("node.exe 없음: " + Paths.NodeExe);
                    return Strings.T("err.noNode", Paths.NodeExe);
                }
                if (!File.Exists(Paths.ServerJs))
                {
                    Log.Error("server/index.js 없음: " + Paths.ServerJs);
                    return Strings.T("err.noServer", Paths.ServerJs);
                }

                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName         = Paths.NodeExe;
                    psi.Arguments        = "\"" + Paths.ServerJs + "\"";
                    psi.WorkingDirectory = Paths.AppDir;
                    // ★ 콘솔 창이 뜨지 않게 하는 3종 세트.
                    //   UseShellExecute=false 가 아니면 CreateNoWindow 가 무시된다.
                    psi.UseShellExecute  = false;
                    psi.CreateNoWindow   = true;
                    psi.WindowStyle      = ProcessWindowStyle.Hidden;

                    // job 은 기동할 때마다 새로 만든다. '정지'가 job 을 통째로 정리하기 때문에
                    // 정지한 job 을 재사용할 수 없다(종료된 job 에는 프로세스를 넣지 못한다).
                    _job = new JobObject();

                    _proc = Process.Start(psi);
                    if (_proc == null) return Strings.T("err.startFail", "Process.Start returned null");

                    // ⚠ 기동 직후 즉시 job 에 넣는다. node 가 java 를 띄우기 전에 넣어야
                    //   손자까지 job 에 들어간다. node 는 모듈 로딩 후에야 브리지를 띄우므로
                    //   실무상 충분한 여유가 있지만, 그래도 첫 줄에서 처리한다.
                    _job.Assign(_proc);

                    Log.Info(string.Format("서버 기동 요청 pid={0} port={1} cmd=\"{2}\" \"{3}\"",
                        _proc.Id, Port, Paths.NodeExe, Paths.ServerJs));
                    return null;
                }
                catch (Exception e)
                {
                    Log.Error("서버 기동 실패: " + e.Message);
                    CleanupLocked();
                    return Strings.T("err.startFail", e.Message);
                }
            }
        }

        /// <summary>
        /// 서버를 정지한다. 트레이는 계속 남는다.
        ///
        /// 정상 종료를 먼저 시도하고 안 되면 강제 종료한다:
        ///   ① taskkill /PID n /T (강제 플래그 없음) — 트리에 종료를 "요청"한다.
        ///   ② 3초 안에 안 죽으면 Job Object 를 통째로 종료(강제).
        ///
        /// ⚠ 솔직히 적어둔다: 창이 없는 콘솔 프로세스(node)는 ①에 응답하지 않는 경우가
        ///   대부분이다. 윈도우에는 유닉스의 SIGTERM 에 해당하는 확실한 수단이 없다
        ///   (GenerateConsoleCtrlEvent 는 콘솔을 공유해야 하는데, 우리는 콘솔을 없앴다).
        ///   그래서 **실질적인 보증은 ②(Job Object)** 다. ①은 node 가 스스로 정리할 기회를
        ///   주는 예의이지, 여기에 기대지는 않는다.
        /// </summary>
        /// <returns>오류 메시지. 성공이면 null.</returns>
        public string Stop()
        {
            lock (_gate)
            {
                if (_proc == null && _job == null)
                {
                    Log.Info("정지 요청 — 관리 중인 서버 프로세스가 없습니다.");
                    return null;
                }

                int pid = -1;
                try { if (_proc != null) pid = _proc.Id; } catch (Exception) { }

                bool graceful = false;
                if (pid > 0)
                {
                    try
                    {
                        if (!_proc.HasExited)
                        {
                            RunHidden("taskkill.exe", "/PID " + pid + " /T");
                            graceful = _proc.WaitForExit(3000);
                        }
                        else graceful = true;
                    }
                    catch (Exception e) { Log.Warn("정상 종료 시도 중 오류(무시): " + e.Message); }
                }

                if (graceful) Log.Info("서버 정상 종료됨 pid=" + pid);
                else          Log.Warn("정상 종료에 응답하지 않아 강제 종료합니다 pid=" + pid);

                // ★ 정상 종료됐더라도 job 정리는 반드시 한다.
                //   node 가 죽어도 손자 java 는 살아남을 수 있기 때문이다(오늘의 사고 원인).
                try
                {
                    if (_job != null) _job.TerminateAll();
                }
                catch (Exception e) { Log.Warn("Job 종료 중 오류: " + e.Message); }

                // 폴백: Job Object 를 못 만든 환경(구형 OS)을 대비해 트리 강제 종료도 한 번 더.
                if (pid > 0)
                {
                    try
                    {
                        if (_proc != null && !_proc.HasExited)
                            RunHidden("taskkill.exe", "/PID " + pid + " /T /F");
                    }
                    catch (Exception) { }
                }

                CleanupLocked();
                Log.Info("정지 완료 (자식·손자 프로세스 정리)");
                return null;
            }
        }

        private void CleanupLocked()
        {
            if (_proc != null)
            {
                try { _proc.Dispose(); } catch (Exception) { }
                _proc = null;
            }
            if (_job != null)
            {
                try { _job.Dispose(); } catch (Exception) { }
                _job = null;
            }
        }

        /// <summary>
        /// 보조 프로세스를 창 없이 돌린다(taskkill 등).
        /// ★ CreateNoWindow 를 빼면 검은 콘솔이 번쩍인다. 트레이 앱에서는 이것도 결함이다.
        /// </summary>
        private static void RunHidden(string file, string args)
        {
            ProcessStartInfo psi = new ProcessStartInfo(file, args);
            psi.UseShellExecute = false;
            psi.CreateNoWindow  = true;
            psi.WindowStyle     = ProcessWindowStyle.Hidden;
            using (Process p = Process.Start(psi))
            {
                if (p != null) p.WaitForExit(5000);
            }
        }

        public void Dispose()
        {
            lock (_gate) { CleanupLocked(); }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 트레이 UI
    // ═════════════════════════════════════════════════════════════════════════

    internal sealed class TrayApp : ApplicationContext
    {
        private readonly NotifyIcon _icon;
        private readonly ContextMenuStrip _menu;
        private readonly ToolStripMenuItem _miOpen, _miStart, _miStop, _miQuit;
        private readonly ServerController _server = new ServerController();
        // ⚠ Timer 는 System.Threading 과 System.Windows.Forms 양쪽에 있어 이름만 쓰면 컴파일이
        //   모호해진다. UI 스레드에서 도는 WinForms 타이머를 명시한다(메뉴/툴팁을 직접 건드리므로).
        private readonly System.Windows.Forms.Timer _poll;
        private ServerState _state = ServerState.Stopped;
        private bool _quitting;

        /// <param name="autoStart">바로가기로 실행됐을 때는 서버도 함께 띄운다.</param>
        public TrayApp(bool autoStart)
        {
            _miOpen  = new ToolStripMenuItem(Strings.T("menu.open"),  null, OnOpen);
            _miStart = new ToolStripMenuItem(Strings.T("menu.start"), null, OnStart);
            _miStop  = new ToolStripMenuItem(Strings.T("menu.stop"),  null, OnStop);
            _miQuit  = new ToolStripMenuItem(Strings.T("menu.quit"),  null, OnQuit);

            // '열기'를 굵게 — 더블클릭의 기본 동작과 같다는 걸 시각적으로 알린다.
            _miOpen.Font = new Font(_miOpen.Font, FontStyle.Bold);

            _menu = new ContextMenuStrip();
            _menu.Items.Add(_miOpen);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add(_miStart);
            _menu.Items.Add(_miStop);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add(_miQuit);

            _icon = new NotifyIcon();
            _icon.Icon = LoadIcon();
            _icon.ContextMenuStrip = _menu;
            _icon.Visible = true;
            _icon.DoubleClick += OnOpen;   // 아이콘 더블클릭 = 열기

            // 상태 폴링. Process.Exited 이벤트만 쓰면 "외부에서 뜬 서버"나
            // "포트만 죽은 상태"를 놓친다. 2초 주기 확인이 단순하고 확실하다.
            _poll = new System.Windows.Forms.Timer();
            _poll.Interval = 2000;
            _poll.Tick += delegate { RefreshState(); };
            _poll.Start();

            Application.ApplicationExit += delegate { Cleanup(); };
            // 로그오프/셧다운 — 트레이가 조용히 사라지면서 node 를 남기면 안 된다.
            // (KILL_ON_JOB_CLOSE 가 이미 보증하지만, 로그를 남기려면 이 훅이 필요하다.)
            Microsoft.Win32.SystemEvents.SessionEnding += delegate(object s, Microsoft.Win32.SessionEndingEventArgs e)
            {
                Log.Info("세션 종료 감지(" + e.Reason + ") — 서버를 정리합니다.");
                Cleanup();
            };

            if (autoStart)
            {
                // 브라우저는 **node 가 직접 연다**(settings.json 의 server.openBrowser).
                // 트레이가 여기서 또 열면 탭이 두 개 뜬다. 그래서 열지 않는다.
                string err = _server.Start();
                if (err != null) ShowError(err);
            }
            RefreshState();
        }

        /// <summary>
        /// 트레이 아이콘 로드.
        /// 설치 폴더의 OracleTuner.ico 를 우선 쓰고, 없으면 exe 에 박아넣은 아이콘
        /// (/win32icon 으로 넣는다)을 꺼내 쓴다. 둘 다 실패해도 기본 아이콘으로 뜬다 —
        /// 아이콘이 없다고 트레이가 안 뜨면 이 앱의 존재 이유가 사라진다.
        /// </summary>
        private static Icon LoadIcon()
        {
            try
            {
                if (File.Exists(Paths.IconFile))
                    return new Icon(Paths.IconFile, SystemInformation.SmallIconSize);
            }
            catch (Exception e) { Log.Warn("아이콘 파일 로드 실패: " + e.Message); }
            try
            {
                Icon own = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (own != null) return own;
            }
            catch (Exception e) { Log.Warn("exe 아이콘 추출 실패: " + e.Message); }
            return SystemIcons.Application;
        }

        // ── 상태 ────────────────────────────────────────────────────────────

        private void RefreshState()
        {
            if (_quitting) return;

            ServerState s;
            bool child = _server.ChildAlive;
            bool port  = _server.PortResponds();

            if (port) s = ServerState.Running;
            else if (child) s = ServerState.Starting;   // 떴지만 아직 포트를 안 열었다
            else s = ServerState.Stopped;

            if (s != _state)
            {
                Log.Info(string.Format("상태 변화 {0} → {1} (자식={2}, 포트{3}={4})",
                    _state, s, child ? "생존" : "없음", _server.Port, port ? "응답" : "무응답"));
                _state = s;
            }
            ApplyState();
        }

        private void ApplyState()
        {
            bool running  = _state == ServerState.Running;
            bool stopped  = _state == ServerState.Stopped;

            _miOpen.Enabled  = running;
            _miStart.Enabled = stopped;
            _miStop.Enabled  = !stopped;

            string stateText;
            if (_state == ServerState.Running)       stateText = Strings.T("state.running");
            else if (_state == ServerState.Starting) stateText = Strings.T("state.starting");
            else if (_state == ServerState.Stopping) stateText = Strings.T("state.stopping");
            else                                     stateText = Strings.T("state.stopped");

            string tip = stopped
                ? Strings.T("tip.stopped", stateText)
                : Strings.T("tip.running", stateText, _server.Port);

            // NotifyIcon.Text 는 63자를 넘기면 예외가 난다. 안전하게 자른다.
            if (tip.Length > 63) tip = tip.Substring(0, 63);
            try { _icon.Text = tip; } catch (Exception) { }
        }

        // ── 메뉴 동작 ────────────────────────────────────────────────────────

        /// <summary>
        /// 기본 브라우저로 앱을 연다.
        ///
        /// ★ Process.Start(url) 대신 **explorer.exe 에 위임**한다.
        ///   이 트레이 앱이 (설치 스크립트나 다른 런처를 통해) 창 숨김 상태로 실행됐을 때
        ///   그 상태가 자식에게 상속되어 브라우저가 보이지 않는 사고가 오늘 있었다
        ///   (server/index.js openBrowser() 주석 참조).
        ///   explorer.exe 는 이미 떠 있는 셸이 대신 열어주므로 그 상속을 끊는다.
        ///
        /// ⚠ explorer.exe 는 성공해도 종료코드 1 을 자주 반환한다. 종료코드로 판정하지 말 것.
        /// </summary>
        public void OpenBrowser()
        {
            string url = _server.Url;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("explorer.exe", url);
                psi.UseShellExecute = true;   // 셸에 넘긴다
                Process.Start(psi);
                Log.Info("브라우저 열기 요청: explorer.exe \"" + url + "\"");
            }
            catch (Exception e)
            {
                Log.Error("브라우저 열기 실패: " + e.Message);
                ShowError(Strings.T("err.openFail", e.Message));
            }
        }

        private void OnOpen(object sender, EventArgs e)
        {
            if (_state == ServerState.Stopped)
            {
                // 정지 상태에서 더블클릭하면 시작이 자연스럽다(사용자 기대).
                OnStart(sender, e);
                return;
            }
            OpenBrowser();
        }

        /// <summary>
        /// 외부 신호(--start / --stop)용 진입점. **메뉴 항목과 완전히 같은 핸들러**를 부른다.
        ///
        /// 왜 필요한가: 트레이 메뉴는 마우스로만 누를 수 있어서 자동 검증이 불가능하다.
        /// "정지하면 프로세스가 정말 0이 되는가"를 사람 눈이 아니라 수치로 증명하려면
        /// 스크립트에서 같은 동작을 일으킬 수 있어야 한다. 진단할 때도 쓴다
        /// (예: 원격 지원 중 "일단 서버만 내려보세요").
        /// 별도 로직을 만들지 않고 OnStart/OnStop 을 그대로 부르는 것이 요점이다 —
        /// 검증한 경로와 사용자가 실제로 쓰는 경로가 갈리면 검증의 의미가 없다.
        /// </summary>
        public void RequestStart() { OnStart(this, EventArgs.Empty); }
        public void RequestStop()  { OnStop(this, EventArgs.Empty); }

        private void OnStart(object sender, EventArgs e)
        {
            Log.Info("메뉴: 시작");
            _state = ServerState.Starting;
            ApplyState();
            string err = _server.Start();
            if (err != null) ShowError(err);
            RefreshState();
        }

        private void OnStop(object sender, EventArgs e)
        {
            Log.Info("메뉴: 정지");
            _state = ServerState.Stopping;
            ApplyState();
            string err = _server.Stop();
            if (err != null) ShowError(Strings.T("err.stopFail", err));
            RefreshState();
        }

        private void OnQuit(object sender, EventArgs e)
        {
            Log.Info("메뉴: 종료");
            QuitNow();
        }

        /// <summary>외부(--quit, 설치/제거 스크립트)에서 들어온 종료 요청.</summary>
        public void QuitNow()
        {
            if (_quitting) return;
            _quitting = true;
            _poll.Stop();
            Cleanup();
            _icon.Visible = false;   // 이걸 안 하면 트레이에 유령 아이콘이 남는다
            _icon.Dispose();
            Log.Done("트레이 종료 — 자식·손자 프로세스 정리 완료");
            ExitThread();
        }

        /// <summary>서버 정리. 여러 경로(메뉴 종료, ApplicationExit, 세션 종료)에서 불려도 안전해야 한다.</summary>
        private void Cleanup()
        {
            try { _server.Stop(); } catch (Exception e) { Log.Warn("정리 중 오류: " + e.Message); }
            try { _server.Dispose(); } catch (Exception) { }
        }

        private void ShowError(string msg)
        {
            Log.Error(msg.Replace("\n", " "));
            MessageBox.Show(msg, Strings.T("err.title"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 진입점 — 단일 인스턴스 + 프로세스 간 신호
    // ═════════════════════════════════════════════════════════════════════════

    internal static class Program
    {
        // 이름 있는 커널 오브젝트. Local\ 네임스페이스라 같은 로그온 세션 안에서만 공유된다
        // (여러 사용자가 각자 쓰는 터미널 서버 환경에서 서로를 죽이지 않게).
        private const string MutexName    = "Local\\OracleTunerTray.Instance";
        private const string EvtOpenName  = "Local\\OracleTunerTray.Open";
        private const string EvtQuitName  = "Local\\OracleTunerTray.Quit";
        // 진단/검증용 — 메뉴의 '시작'/'정지'와 같은 핸들러를 스크립트에서 부를 수 있게 한다.
        private const string EvtStartName = "Local\\OracleTunerTray.Start";
        private const string EvtStopName  = "Local\\OracleTunerTray.Stop";

        [STAThread]
        private static int Main(string[] rawArgs)
        {
            bool wantQuit  = HasArg(rawArgs, "--quit");
            bool wantStart = HasArg(rawArgs, "--start");
            bool wantStop  = HasArg(rawArgs, "--stop");

            bool createdNew;
            Mutex mutex = new Mutex(true, MutexName, out createdNew);

            if (!createdNew)
            {
                // ── 두 번째 인스턴스 ──
                // 기존 인스턴스에 신호만 보내고 조용히 사라진다.
                // 사용자가 바로가기를 두 번 눌렀다고 서버가 두 개 뜨면 포트 충돌이 난다.
                if (wantQuit)
                {
                    SignalEvent(EvtQuitName);
                    Log.Info("--quit 신호 전달 (기존 인스턴스에 종료 요청)");
                    // 설치/제거 스크립트가 이 프로세스의 종료를 기다린 뒤 파일을 지운다.
                    // 기존 인스턴스가 실제로 사라질 시간을 벌어준다.
                    WaitForInstanceGone(8000);
                }
                else if (wantStop)
                {
                    SignalEvent(EvtStopName);
                    Log.Info("--stop 신호 전달");
                    Thread.Sleep(1500);   // 정지가 끝날 시간을 준다(호출자가 바로 프로세스를 세므로)
                }
                else if (wantStart)
                {
                    SignalEvent(EvtStartName);
                    Log.Info("--start 신호 전달");
                    Thread.Sleep(1500);
                }
                else
                {
                    SignalEvent(EvtOpenName);
                    Log.Info("중복 실행 감지 — 기존 인스턴스에 '열기'를 요청하고 종료합니다.");
                }
                return 0;
            }

            // ── 첫 인스턴스 ──
            if (wantQuit || wantStop || wantStart)
            {
                // 아무도 안 떠 있는데 제어 인자가 들어왔다. 보낼 곳이 없으니 할 일이 없다.
                // (제거 스크립트가 --quit 을 항상 호출하므로 정상적인 경우다.)
                Log.Info("제어 인자(--quit/--stop/--start)를 받았지만 실행 중인 인스턴스가 없습니다. 할 일 없음.");
                mutex.ReleaseMutex();
                return 0;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // 로케일 결정: settings.json → 시스템 UI 문화권 → en
            Strings.Locale = ResolveLocale();

            Log.Info("──────────────────────────────────────────────");
            Log.Info(string.Format("트레이 기동 — 로케일={0} 데이터루트={1} 앱폴더={2}",
                Strings.Locale, Paths.DataRoot, Paths.AppDir));
            // ★ 로케일이 실제로 적용됐는지 화면 없이 증명하기 위해 메뉴 문자열을 그대로 남긴다.
            //   (검증 항목 7 — 스크린샷 없이 로그로 4개 로케일을 확인할 수 있어야 한다.)
            Log.Info("메뉴 문자열: " + Strings.MenuDump());

            TrayApp app = null;
            try
            {
                app = new TrayApp(true);
                StartSignalWatcher(app);
                Application.Run(app);
            }
            catch (Exception e)
            {
                Log.Error("치명적 오류: " + e.ToString());
                MessageBox.Show(e.Message, "Oracle Tuner", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                if (app != null) { try { app.Dispose(); } catch (Exception) { } }
                try { mutex.ReleaseMutex(); } catch (Exception) { }
                mutex.Close();
            }
            return 0;
        }

        private static bool HasArg(string[] args, string name)
        {
            if (args == null) return false;
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if (a == null) continue;
                if (string.Equals(a.Trim(), name, StringComparison.OrdinalIgnoreCase)) return true;
                // /quit 형태도 받아준다(Inno Setup 쪽에서 실수하기 쉬운 표기).
                if (name == "--quit" && (string.Equals(a.Trim(), "/quit", StringComparison.OrdinalIgnoreCase)
                                      || string.Equals(a.Trim(), "-quit", StringComparison.OrdinalIgnoreCase)))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// 로케일 결정 순서: settings.json 의 ui.locale → 시스템 UI 문화권 → en.
        /// (앱 본체 web/js/i18n.js 와 같은 4로케일만 지원한다.)
        /// </summary>
        private static string ResolveLocale()
        {
            string fromSettings = Settings.ReadLocale();
            string norm = Normalize(fromSettings);
            if (norm != null) return norm;

            try
            {
                string sys = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
                norm = Normalize(sys);
                if (norm != null) return norm;
            }
            catch (Exception) { }
            return "en";
        }

        /// <summary>"ko-KR" 같은 값도 "ko" 로 접는다. 지원하지 않는 언어면 null.</summary>
        private static string Normalize(string loc)
        {
            if (string.IsNullOrEmpty(loc)) return null;
            string s = loc.Trim().ToLowerInvariant();
            int dash = s.IndexOf('-');
            if (dash > 0) s = s.Substring(0, dash);
            for (int i = 0; i < Strings.Locales.Length; i++)
                if (Strings.Locales[i] == s) return s;
            return null;
        }

        private static void SignalEvent(string name)
        {
            try
            {
                EventWaitHandle h = EventWaitHandle.OpenExisting(name);
                h.Set();
                h.Close();
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                // 기존 인스턴스가 아직 이벤트를 안 만들었거나 방금 죽었다. 할 일 없음.
            }
            catch (Exception e) { Log.Warn("신호 전달 실패(" + name + "): " + e.Message); }
        }

        /// <summary>
        /// --quit 후 기존 인스턴스가 실제로 사라질 때까지 기다린다.
        ///
        /// ⚠ 뮤텍스로 판정하면 안 된다(처음에 그렇게 짰다가 틀렸다).
        ///   이 프로세스 자신이 Main 첫 줄에서 같은 이름의 뮤텍스 핸들을 이미 들고 있어서
        ///   커널 오브젝트가 계속 살아 있고, 몇 번을 다시 열어도 createdNew 는 false 다.
        ///   2026-07-31 실측: 기존 인스턴스가 3초 만에 깨끗이 종료됐는데도 8초를 꽉 채워
        ///   기다린 뒤 "사라지지 않았습니다" 경고를 남겼다. 판정 대상이 틀렸던 것이다.
        ///
        ///   알고 싶은 것은 "그 프로세스가 사라졌는가" 이므로 프로세스를 직접 본다.
        ///   제거 스크립트가 이 프로세스의 종료를 기다렸다가 파일을 지우므로, 여기서
        ///   정확히 판정하는 것이 곧 "파일 잠금이 풀린 뒤에 지운다"는 보장이 된다.
        /// </summary>
        private static void WaitForInstanceGone(int timeoutMs)
        {
            int self = Process.GetCurrentProcess().Id;
            string myName = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
            int waited = 0;
            while (waited < timeoutMs)
            {
                bool anyOther = false;
                try
                {
                    Process[] list = Process.GetProcessesByName(myName);
                    for (int i = 0; i < list.Length; i++)
                    {
                        try { if (list[i].Id != self) anyOther = true; }
                        catch (Exception) { }
                        try { list[i].Dispose(); } catch (Exception) { }
                    }
                }
                catch (Exception) { return; }

                if (!anyOther)
                {
                    Log.Info("기존 인스턴스 종료 확인 (" + waited + "ms)");
                    // 프로세스가 사라진 뒤에도 커널이 이미지 파일 핸들을 놓는 데 짧은 지연이 있다.
                    // 제거 스크립트가 곧바로 파일을 지우므로 여기서 조금 더 기다려 준다.
                    Thread.Sleep(700);
                    return;
                }
                Thread.Sleep(200);
                waited += 200;
            }
            Log.Warn("--quit 후 " + timeoutMs + "ms 안에 기존 인스턴스가 사라지지 않았습니다.");
        }

        /// <summary>
        /// 다른 인스턴스가 보내는 신호(열기 / 종료)를 배경 스레드에서 기다린다.
        /// UI 스레드를 막으면 안 되므로 별도 스레드를 쓰고, 실제 동작은 Invoke 로 UI 스레드에 넘긴다.
        /// </summary>
        private static void StartSignalWatcher(TrayApp app)
        {
            EventWaitHandle evtOpen  = new EventWaitHandle(false, EventResetMode.AutoReset, EvtOpenName);
            EventWaitHandle evtQuit  = new EventWaitHandle(false, EventResetMode.AutoReset, EvtQuitName);
            EventWaitHandle evtStart = new EventWaitHandle(false, EventResetMode.AutoReset, EvtStartName);
            EventWaitHandle evtStop  = new EventWaitHandle(false, EventResetMode.AutoReset, EvtStopName);

            // WinForms 컨트롤이 아니라 SynchronizationContext 로 UI 스레드에 넘긴다.
            // (TrayApp 생성자가 ContextMenuStrip 을 만들면서 WinForms 동기화 컨텍스트가 설치되므로
            //  이 시점에는 이미 값이 들어 있다. 그래도 null 이면 직접 호출로 폴백한다.)
            System.Threading.SynchronizationContext ui = System.Threading.SynchronizationContext.Current;

            Thread t = new Thread(delegate()
            {
                WaitHandle[] handles = new WaitHandle[] { evtOpen, evtQuit, evtStart, evtStop };
                while (true)
                {
                    int idx;
                    try { idx = WaitHandle.WaitAny(handles); }
                    catch (Exception) { return; }

                    if (idx == 0)
                    {
                        Log.Info("신호 수신: 열기");
                        if (ui != null) ui.Post(delegate { app.OpenBrowser(); }, null);
                        else app.OpenBrowser();
                    }
                    else if (idx == 2)
                    {
                        Log.Info("신호 수신: 시작(--start)");
                        if (ui != null) ui.Post(delegate { app.RequestStart(); }, null);
                        else app.RequestStart();
                    }
                    else if (idx == 3)
                    {
                        Log.Info("신호 수신: 정지(--stop)");
                        if (ui != null) ui.Post(delegate { app.RequestStop(); }, null);
                        else app.RequestStop();
                    }
                    else
                    {
                        Log.Info("신호 수신: 종료(--quit) — 설치/제거 스크립트의 요청일 수 있습니다.");
                        if (ui != null) ui.Post(delegate { app.QuitNow(); }, null);
                        else app.QuitNow();
                        return;
                    }
                }
            });
            t.IsBackground = true;   // 이 스레드 때문에 프로세스가 안 죽으면 안 된다
            t.Start();
        }
    }
}
