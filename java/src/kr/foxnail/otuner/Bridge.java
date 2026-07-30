package kr.foxnail.otuner;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.sql.SQLException;
import java.sql.Statement;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

/**
 * Node 서버와 통신하는 JDBC 사이드카 프로세스.
 *
 * <p><b>프로토콜</b> — 표준입력으로 JSON 요청을 한 줄씩 받고, 표준출력으로 응답을 한 줄씩 쓴다.
 * 응답 줄은 반드시 {@code @@OT@@} 로 시작한다. 드라이버나 JVM 이 표준출력에 무언가를 흘려도
 * 이 표식 덕분에 프로토콜이 깨지지 않는다(실제로 ojdbc 는 경고를 stdout 에 쓸 때가 있다).
 *
 * <pre>
 *   요청  {"id":"7","cmd":"execute","params":{...}}
 *   응답  @@OT@@{"id":"7","ok":true,"data":{...},"elapsedMs":12.3}
 *   오류  @@OT@@{"id":"7","ok":false,"error":{"message":"...","ora":"ORA-00942"}}
 * </pre>
 *
 * <p>로그는 표준오류로만 나간다(총괄 규약 형식: {@code [YYYY-MM-DD HH:MM:SS] LEVEL COMPONENT 메시지}).
 */
public final class Bridge {

    public static final String MARK = "@@OT@@";
    public static final String VERSION = "1.0.0";

    private static PrintStream out;
    private static PrintStream log;
    private static final Object WRITE_LOCK = new Object();
    private static volatile List<String> driverJars = new ArrayList<String>();

    public static void main(String[] args) throws Exception {
        out = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true, "UTF-8");
        log = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.err), true, "UTF-8");

        for (int i = 0; i < args.length; i++) {
            if ("--jars".equals(args[i]) && i + 1 < args.length) {
                for (String p : args[i + 1].split(java.io.File.pathSeparator)) {
                    if (!p.trim().isEmpty()) driverJars.add(p.trim());
                }
                i++;
            }
        }

        info("BRIDGE", "started pid=" + pid() + " java=" + System.getProperty("java.version")
            + " jars=" + driverJars.size());

        Map<String, Object> ready = Json.obj();
        ready.put("event", "ready");
        ready.put("version", VERSION);
        ready.put("javaVersion", System.getProperty("java.version"));
        ready.put("javaHome", System.getProperty("java.home"));
        ready.put("encoding", System.getProperty("file.encoding"));
        emit(ready);

        ExecutorService pool = Executors.newCachedThreadPool(new ThreadFactory() {
            private int n = 0;
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "otuner-worker-" + (++n));
                t.setDaemon(true);
                return t;
            }
        });

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"), 1 << 16);
        String line;
        while ((line = in.readLine()) != null) {
            if (line.trim().isEmpty()) continue;
            final String req = line;
            // cancel/shutdown 은 워커가 점유돼 있어도 즉시 처리해야 하므로 읽기 스레드에서 직접 실행한다.
            String quick = peekCmd(req);
            if ("cancel".equals(quick) || "shutdown".equals(quick)) {
                handleSafely(req);
                if ("shutdown".equals(quick)) break;
            } else {
                pool.submit(new Runnable() { public void run() { handleSafely(req); } });
            }
        }
        info("BRIDGE", "stdin closed - shutting down");
        // 진행 중인 요청의 응답이 유실되지 않도록 잠시 기다린 뒤 종료한다.
        pool.shutdown();
        try {
            pool.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException ignore) {
            Thread.currentThread().interrupt();
        }
        Db.closeAll();
        pool.shutdownNow();
        System.exit(0);
    }

    private static String peekCmd(String raw) {
        try {
            Map<String, Object> m = Json.asMap(Json.parse(raw));
            return Json.str(m, "cmd", "");
        } catch (Throwable t) {
            return "";
        }
    }

    private static void handleSafely(String raw) {
        String id = "?";
        long t0 = System.nanoTime();
        try {
            Map<String, Object> req = Json.asMap(Json.parse(raw));
            id = Json.str(req, "id", "?");
            String cmd = Json.str(req, "cmd", "");
            Map<String, Object> params = Json.asMap(req.get("params"));
            Object data = dispatch(cmd, params, id);
            Map<String, Object> res = Json.obj();
            res.put("id", id);
            res.put("ok", Boolean.TRUE);
            res.put("data", data);
            res.put("elapsedMs", Double.valueOf(Math.round((System.nanoTime() - t0) / 1e3) / 1e3));
            emit(res);
        } catch (Throwable t) {
            Map<String, Object> res = Json.obj();
            res.put("id", id);
            res.put("ok", Boolean.FALSE);
            res.put("error", Db.errorMap(t));
            res.put("elapsedMs", Double.valueOf(Math.round((System.nanoTime() - t0) / 1e3) / 1e3));
            emit(res);
            error("BRIDGE", "cmd failed id=" + id + " : " + t);
        }
    }

    // ── 명령 디스패치 ─────────────────────────────────────────────────────────

    private static Object dispatch(String cmd, Map<String, Object> p, String reqId) throws Exception {
        if ("ping".equals(cmd)) {
            Map<String, Object> m = Json.obj();
            m.put("pong", Boolean.TRUE);
            m.put("version", VERSION);
            m.put("javaVersion", System.getProperty("java.version"));
            m.put("javaHome", System.getProperty("java.home"));
            m.put("sessions", Db.listSessions());
            return m;
        }
        if ("setDriverJars".equals(cmd)) {
            List<String> jars = strList(p.get("jars"));
            driverJars = jars;
            info("BRIDGE", "driver jars set: " + jars);
            return Db.driverInfo(jars);
        }
        if ("driverInfo".equals(cmd)) {
            List<String> jars = p.containsKey("jars") ? strList(p.get("jars")) : driverJars;
            return Db.driverInfo(jars);
        }
        if ("connect".equals(cmd)) {
            List<String> jars = p.containsKey("jars") ? strList(p.get("jars")) : driverJars;
            Db.Session s = Db.connect(p, jars);
            info("BRIDGE", "connected " + s.id + " " + s.url + " as " + s.user);
            Map<String, Object> m = Json.obj();
            m.put("sessionId", s.id);
            m.put("server", Caps.serverInfo(s));
            if (Json.bool(p, "probeCapabilities", true)) {
                m.put("capabilities", Caps.probe(s, true));
            }
            return m;
        }
        if ("disconnect".equals(cmd)) {
            String sid = Json.str(p, "sessionId", "");
            Db.close(sid);
            info("BRIDGE", "disconnected " + sid);
            Map<String, Object> m = Json.obj();
            m.put("closed", Boolean.TRUE);
            return m;
        }
        if ("sessions".equals(cmd)) {
            Map<String, Object> m = Json.obj();
            m.put("sessions", Db.listSessions());
            return m;
        }
        if ("shutdown".equals(cmd)) {
            Db.closeAll();
            Map<String, Object> m = Json.obj();
            m.put("bye", Boolean.TRUE);
            return m;
        }
        if ("cancel".equals(cmd)) {
            Db.Session s = Db.sessionOrNull(Json.str(p, "sessionId", ""));
            Map<String, Object> m = Json.obj();
            if (s == null) { m.put("cancelled", Boolean.FALSE); m.put("reason", "세션 없음"); return m; }
            Statement st = s.running;
            if (st == null) { m.put("cancelled", Boolean.FALSE); m.put("reason", "실행 중인 문장 없음"); return m; }
            try {
                st.cancel();
                m.put("cancelled", Boolean.TRUE);
                info("BRIDGE", "cancelled statement on " + s.id);
            } catch (SQLException e) {
                m.put("cancelled", Boolean.FALSE);
                m.put("reason", e.getMessage());
            }
            return m;
        }

        // 아래 명령은 모두 세션이 필요하다
        Db.Session s = Db.session(Json.str(p, "sessionId", ""));

        if ("capabilities".equals(cmd)) return Caps.probe(s, Json.bool(p, "force", false));
        if ("serverInfo".equals(cmd)) return Caps.serverInfo(s);
        if ("execute".equals(cmd)) return Exec.execute(s, p);
        if ("benchmark".equals(cmd)) return Exec.benchmark(s, p);
        if ("compare".equals(cmd)) return Exec.compare(s, p);
        if ("tournament".equals(cmd)) return Exec.tournament(s, p, reqId);
        if ("explain".equals(cmd)) return Plan.explain(s, Json.str(p, "sql", ""));
        if ("displayCursor".equals(cmd)) return Plan.displayCursor(s, Json.str(p, "format", ""));
        if ("sqlStats".equals(cmd)) return Plan.sqlStats(s, Json.str(p, "sqlId", ""));
        if ("describeQuery".equals(cmd)) return Meta.describeQuery(s, Json.str(p, "sql", ""));
        if ("schemas".equals(cmd)) return Meta.schemas(s);
        if ("objects".equals(cmd)) {
            return Meta.objects(s, Json.str(p, "owner", ""), Json.str(p, "pattern", ""), Json.intv(p, "limit", 500));
        }
        if ("columns".equals(cmd)) return Meta.columns(s, Json.str(p, "owner", ""), Json.str(p, "table", ""));
        if ("indexes".equals(cmd)) return Meta.indexes(s, Json.str(p, "owner", ""), Json.str(p, "table", ""));
        if ("constraints".equals(cmd)) return Meta.constraints(s, Json.str(p, "owner", ""), Json.str(p, "table", ""));
        if ("tableStats".equals(cmd)) return Meta.tableStats(s, Json.str(p, "owner", ""), Json.str(p, "table", ""));
        if ("columnStats".equals(cmd)) return Meta.columnStats(s, Json.str(p, "owner", ""), Json.str(p, "table", ""));
        if ("estimateRows".equals(cmd)) {
            Object sp = p.get("samplePct");
            Double pct = (sp instanceof Number) ? Double.valueOf(((Number) sp).doubleValue()) : null;
            return Meta.estimateRows(s, Json.str(p, "owner", ""), Json.str(p, "table", ""), pct,
                Json.intv(p, "timeoutSec", 60));
        }
        if ("ddl".equals(cmd)) {
            return Meta.ddl(s, Json.str(p, "type", "TABLE"), Json.str(p, "owner", ""), Json.str(p, "name", ""));
        }
        if ("commit".equals(cmd)) {
            s.conn.commit();
            Map<String, Object> m = Json.obj();
            m.put("committed", Boolean.TRUE);
            return m;
        }
        if ("rollback".equals(cmd)) {
            s.conn.rollback();
            Map<String, Object> m = Json.obj();
            m.put("rolledBack", Boolean.TRUE);
            return m;
        }
        if ("alterSession".equals(cmd)) {
            String stmt = Json.str(p, "sql", "");
            if (!stmt.toUpperCase().trim().startsWith("ALTER SESSION")) {
                throw new SQLException("alterSession 은 ALTER SESSION 문장만 허용합니다.");
            }
            String err = Sql.execQuiet(s.conn, Plan.stripTrailingSemicolon(stmt), 10);
            Map<String, Object> m = Json.obj();
            m.put("ok", Boolean.valueOf(err == null));
            if (err != null) m.put("error", err);
            return m;
        }

        throw new IllegalArgumentException("알 수 없는 명령: " + cmd);
    }

    @SuppressWarnings("unchecked")
    private static List<String> strList(Object o) {
        List<String> out = new ArrayList<String>();
        if (o instanceof List) {
            for (Object v : (List<Object>) o) if (v != null) out.add(String.valueOf(v));
        } else if (o instanceof String && !((String) o).trim().isEmpty()) {
            out.add((String) o);
        }
        return out;
    }

    // ── 출력 ─────────────────────────────────────────────────────────────────

    /**
     * 요청/응답 매칭과 별개인 진행 이벤트를 stdout 으로 흘린다. {@code id} 는 원 요청과 같지만
     * {@code event} 필드가 있어 Node 쪽 파서가 promise 를 resolve 하지 않고 별도로 처리한다.
     */
    static void event(String reqId, String eventName, Map<String, Object> data) {
        Map<String, Object> m = Json.obj();
        m.put("id", reqId);
        m.put("event", eventName);
        if (data != null) m.putAll(data);
        emit(m);
    }

    private static void emit(Map<String, Object> obj) {
        String s = Json.write(obj);
        synchronized (WRITE_LOCK) {
            out.print(MARK);
            out.println(s);
            out.flush();
        }
    }

    static void info(String comp, String msg) { logLine("INFO", comp, msg); }

    static void error(String comp, String msg) { logLine("ERROR", comp, msg); }

    private static void logLine(String level, String comp, String msg) {
        String ts = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
        log.println("[" + ts + "] " + level + " " + comp + " " + msg);
        log.flush();
    }

    private static String pid() {
        try {
            return String.valueOf(ProcessHandle.current().pid());
        } catch (Throwable t) {
            return "?";
        }
    }
}
