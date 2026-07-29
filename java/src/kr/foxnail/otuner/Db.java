package kr.foxnail.otuner;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * JDBC 드라이버 로딩과 세션(커넥션) 보관.
 *
 * <p><b>왜 URLClassLoader 인가</b> — ojdbc jar 경로를 사용자가 설정에서 바꿀 수 있어야 한다는
 * 요구사항 때문에, 시작 시 {@code -cp} 로 고정하지 않고 런타임에 jar 를 읽어 드라이버를 만든다.
 * 이렇게 로드한 드라이버는 {@link java.sql.DriverManager} 가 보안상 거부하므로
 * ({@code DriverManager} 는 호출자 클래스로더에서 보이는 드라이버만 허용)
 * {@link Driver#connect(String, Properties)} 를 직접 호출한다.
 */
public final class Db {

    private Db() {}

    /** 드라이버 후보 클래스명 — 신형 우선. */
    private static final String[] DRIVER_CLASSES = {
        "oracle.jdbc.OracleDriver",
        "oracle.jdbc.driver.OracleDriver"
    };

    private static final Map<String, Driver> DRIVER_CACHE = new ConcurrentHashMap<String, Driver>();
    private static final Map<String, ClassLoader> LOADER_CACHE = new ConcurrentHashMap<String, ClassLoader>();
    private static final Map<String, Session> SESSIONS = new ConcurrentHashMap<String, Session>();
    private static final AtomicLong SEQ = new AtomicLong(1);

    /** 하나의 DB 접속. 실행 중 Statement 를 들고 있어 취소(cancel)를 지원한다. */
    public static final class Session {
        public final String id;
        public final Connection conn;
        public final String url;
        public final String user;
        public final String driverInfo;
        /** 권한 탐침 결과. key → true(사용가능)/false(불가) */
        public final Map<String, Boolean> caps = new LinkedHashMap<String, Boolean>();
        /** 권한 탐침 실패 사유(ORA-xxxxx 등). */
        public final Map<String, String> capMessages = new LinkedHashMap<String, String>();
        /** 이 세션에서 확보한 PLAN_TABLE 이름 (없으면 null). */
        public volatile String planTable;
        /** 현재 실행 중인 Statement — cancel 명령이 참조한다. */
        public volatile Statement running;
        public volatile boolean capsProbed;

        Session(String id, Connection conn, String url, String user, String driverInfo) {
            this.id = id;
            this.conn = conn;
            this.url = url;
            this.user = user;
            this.driverInfo = driverInfo;
        }
    }

    // ── 드라이버 ──────────────────────────────────────────────────────────────

    /**
     * jar 목록에서 Oracle JDBC 드라이버를 로드한다.
     * 이미 현재 클래스패스에 있으면 그것을 쓴다(설치형 배포 대비).
     *
     * @param jars ojdbc*.jar 절대경로 목록. 비어 있으면 현재 클래스패스만 시도.
     */
    public static Driver loadDriver(List<String> jars) throws Exception {
        String key = String.valueOf(jars);
        Driver cached = DRIVER_CACHE.get(key);
        if (cached != null) return cached;

        Exception last = null;

        // 1) 현재 클래스패스
        for (String cn : DRIVER_CLASSES) {
            try {
                Driver d = (Driver) Class.forName(cn).getDeclaredConstructor().newInstance();
                DRIVER_CACHE.put(key, d);
                return d;
            } catch (Throwable t) {
                last = (t instanceof Exception) ? (Exception) t : new Exception(t);
            }
        }

        // 2) 지정된 jar 들
        if (jars == null || jars.isEmpty()) {
            throw new IllegalStateException(
                "JDBC 드라이버를 찾을 수 없습니다. 설정에서 ojdbc jar 경로(jdbcDriverPaths)를 지정하세요. " +
                (last == null ? "" : ("(" + last.getMessage() + ")")));
        }
        List<URL> urls = new ArrayList<URL>();
        List<String> missing = new ArrayList<String>();
        for (String p : jars) {
            File f = new File(p);
            if (!f.isFile()) { missing.add(p); continue; }
            urls.add(f.toURI().toURL());
        }
        if (urls.isEmpty()) {
            throw new IllegalStateException("지정한 드라이버 jar 를 찾을 수 없습니다: " + missing);
        }
        ClassLoader cl = LOADER_CACHE.get(key);
        if (cl == null) {
            cl = new URLClassLoader(urls.toArray(new URL[0]), Db.class.getClassLoader());
            LOADER_CACHE.put(key, cl);
        }
        for (String cn : DRIVER_CLASSES) {
            try {
                Driver d = (Driver) Class.forName(cn, true, cl).getDeclaredConstructor().newInstance();
                DRIVER_CACHE.put(key, d);
                return d;
            } catch (Throwable t) {
                last = (t instanceof Exception) ? (Exception) t : new Exception(t);
            }
        }
        throw new IllegalStateException("jar 는 찾았지만 드라이버 클래스를 로드하지 못했습니다: " + jars +
            (last == null ? "" : (" / " + last)));
    }

    /** 드라이버 메타정보(버전 등)를 조회한다. 접속하지 않는다. */
    public static Map<String, Object> driverInfo(List<String> jars) {
        Map<String, Object> r = Json.obj();
        try {
            Driver d = loadDriver(jars);
            r.put("ok", Boolean.TRUE);
            r.put("class", d.getClass().getName());
            r.put("version", d.getMajorVersion() + "." + d.getMinorVersion());
            try {
                Object full = d.getClass().getMethod("getVersion").invoke(d);
                if (full != null) r.put("fullVersion", String.valueOf(full).trim());
            } catch (Throwable ignore) { /* ojdbc 만 제공하는 메서드 */ }
            r.put("jdbcCompliant", Boolean.valueOf(d.jdbcCompliant()));
        } catch (Exception e) {
            r.put("ok", Boolean.FALSE);
            r.put("error", String.valueOf(e.getMessage()));
        }
        r.put("jars", jars);
        return r;
    }

    // ── 접속 ──────────────────────────────────────────────────────────────────

    /**
     * 접속 URL 을 만든다.
     * <ul>
     *   <li>{@code url} 이 주어지면 그대로 사용(TNS/EZConnect/전체 DESCRIPTION 문자열 모두 허용)</li>
     *   <li>아니면 {@code host/port/serviceName|sid} 로 조립</li>
     * </ul>
     */
    public static String buildUrl(Map<String, Object> p) {
        String url = Json.str(p, "url", "").trim();
        if (!url.isEmpty()) {
            return url.toLowerCase().startsWith("jdbc:") ? url : ("jdbc:oracle:thin:@" + url);
        }
        String host = Json.str(p, "host", "localhost").trim();
        int port = Json.intv(p, "port", 1521);
        String service = Json.str(p, "serviceName", "").trim();
        String sid = Json.str(p, "sid", "").trim();
        if (!service.isEmpty()) return "jdbc:oracle:thin:@//" + host + ":" + port + "/" + service;
        if (!sid.isEmpty()) return "jdbc:oracle:thin:@" + host + ":" + port + ":" + sid;
        // 둘 다 비면 ".../" 로 끝나는 잘못된 URL 이 만들어져 ORA-12261 이 난다.
        // 임의의 기본값으로 때우지 말고, 무엇을 채워야 하는지 분명히 알린다.
        throw new IllegalArgumentException(
            "서비스명(또는 SID)을 입력해야 합니다. 예: FREEPDB1 — 접속 창의 [서비스명] 칸을 채우세요. "
            + "(Oracle Free 는 보통 FREEPDB1, XE 는 XEPDB1 입니다)");
    }

    /**
     * 새 세션을 연다.
     *
     * <p>안전 기본값: {@code autoCommit = false}. 튜닝 도구는 사용자 DML 을 시험 삼아 돌리는 일이
     * 잦으므로 명시적으로 커밋하기 전에는 반영되지 않아야 한다.
     */
    public static Session connect(Map<String, Object> p, List<String> jars) throws Exception {
        String url = buildUrl(p);
        String user = Json.str(p, "user", "");
        String password = Json.str(p, "password", "");
        String role = Json.str(p, "role", "").trim().toUpperCase();

        Properties props = new Properties();
        props.setProperty("user", user);
        props.setProperty("password", password);
        if ("SYSDBA".equals(role) || "SYSOPER".equals(role)) {
            props.setProperty("internal_logon", role.toLowerCase());
        }
        int loginTimeout = Json.intv(p, "loginTimeoutSec", 15);
        props.setProperty("oracle.net.CONNECT_TIMEOUT", String.valueOf(loginTimeout * 1000));
        // 읽기 타임아웃은 statement timeout 으로 따로 제어하므로 여기서는 넉넉히 둔다.
        props.setProperty("oracle.jdbc.ReadTimeout", String.valueOf(Json.intv(p, "readTimeoutSec", 0) * 1000));
        props.setProperty("v$session.program", "OracleTuner");
        props.setProperty("oracle.jdbc.implicitStatementCacheSize", "0"); // 튜닝 측정이 캐시에 영향받지 않게

        Driver drv = loadDriver(jars);
        Connection c = drv.connect(url, props);
        if (c == null) {
            throw new SQLException("드라이버가 이 URL 을 처리하지 못했습니다(형식 확인 필요): " + url);
        }
        c.setAutoCommit(false);

        String id = "S" + SEQ.getAndIncrement();
        String dinfo = drv.getClass().getName() + " " + drv.getMajorVersion() + "." + drv.getMinorVersion();
        Session s = new Session(id, c, url, user, dinfo);

        // 모듈/액션 태깅 — 권한이 없어도 무시하고 진행
        try { c.setClientInfo("OCSID.MODULE", "OracleTuner"); } catch (Throwable ignore) { }
        try {
            Statement st = c.createStatement();
            try { st.execute("ALTER SESSION SET NLS_DATE_FORMAT='YYYY-MM-DD HH24:MI:SS'"); } catch (SQLException ignore) { }
            try { st.execute("ALTER SESSION SET NLS_TIMESTAMP_FORMAT='YYYY-MM-DD HH24:MI:SSXFF'"); } catch (SQLException ignore) { }
            st.close();
        } catch (SQLException ignore) { }

        SESSIONS.put(id, s);
        return s;
    }

    public static Session session(String id) throws SQLException {
        Session s = SESSIONS.get(id);
        if (s == null) throw new SQLException("세션을 찾을 수 없습니다: " + id + " (재접속이 필요합니다)");
        return s;
    }

    public static Session sessionOrNull(String id) { return SESSIONS.get(id); }

    public static void close(String id) {
        Session s = SESSIONS.remove(id);
        if (s == null) return;
        try { s.conn.close(); } catch (SQLException ignore) { }
    }

    public static List<Object> listSessions() {
        List<Object> out = Json.arr();
        for (Session s : SESSIONS.values()) {
            Map<String, Object> m = Json.obj();
            m.put("sessionId", s.id);
            m.put("url", s.url);
            m.put("user", s.user);
            boolean alive;
            try { alive = !s.conn.isClosed(); } catch (SQLException e) { alive = false; }
            m.put("alive", Boolean.valueOf(alive));
            out.add(m);
        }
        return out;
    }

    public static void closeAll() {
        for (String id : new ArrayList<String>(SESSIONS.keySet())) close(id);
    }

    // ── 오류 변환 ─────────────────────────────────────────────────────────────

    /** SQLException 을 UI 가 이해할 수 있는 형태로 바꾼다(ORA 코드 추출 포함). */
    public static Map<String, Object> errorMap(Throwable t) {
        Map<String, Object> m = Json.obj();
        String msg = t.getMessage() == null ? t.toString() : t.getMessage();
        m.put("message", msg);
        m.put("type", t.getClass().getName());
        if (t instanceof SQLException) {
            SQLException se = (SQLException) t;
            m.put("errorCode", Integer.valueOf(se.getErrorCode()));
            m.put("sqlState", se.getSQLState());
            m.put("ora", oraCode(msg));
        }
        return m;
    }

    /** "ORA-00942: table or view does not exist" → "ORA-00942" */
    public static String oraCode(String msg) {
        if (msg == null) return null;
        int i = msg.indexOf("ORA-");
        if (i < 0) return null;
        int j = i + 4;
        while (j < msg.length() && Character.isDigit(msg.charAt(j))) j++;
        return (j > i + 4) ? msg.substring(i, j) : null;
    }
}
