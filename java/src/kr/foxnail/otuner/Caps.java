package kr.foxnail.otuner;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 권한 탐침(Capability Probe).
 *
 * <p><b>이 클래스가 이 도구의 성격을 결정한다.</b> 운영 DB 계정은 V$ 뷰나 DBA_ 딕셔너리를
 * 못 보는 경우가 흔하다. 그래서 "무엇을 할 수 있는지" 를 접속 직후 한 번 실측해 두고,
 * 이후 모든 기능이 그 결과에 따라 <i>가능한 경로 중 가장 좋은 것</i>으로 자동 강등된다.
 *
 * <p>탐침은 전부 읽기 전용이며 각각 5초 타임아웃이다. 실패는 정상 상황이므로 사유만 기록한다.
 */
public final class Caps {

    private Caps() {}

    /** 탐침 항목 정의. */
    static final class Probe {
        final String key;        // 기능 키
        final String label;      // 화면 표시명
        final String category;   // plan / runtime / dictionary / meta
        final String sql;        // 판정용 읽기전용 SQL
        final String impact;     // 실패 시 무엇이 안 되는가

        Probe(String key, String label, String category, String sql, String impact) {
            this.key = key; this.label = label; this.category = category; this.sql = sql; this.impact = impact;
        }
    }

    private static final Probe[] PROBES = {
        // ── 실행계획 ─────────────────────────────────────────────────────────
        new Probe("plan_table", "PLAN_TABLE", "plan",
            "SELECT COUNT(*) FROM plan_table WHERE 1=0",
            "EXPLAIN PLAN 을 저장할 곳이 없습니다. 개인용 계획 테이블 생성으로 대체를 시도합니다."),
        new Probe("dbms_xplan_display", "DBMS_XPLAN.DISPLAY", "plan",
            "SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', NULL, 'BASIC')) WHERE ROWNUM<2",
            "표준 실행계획 서식 출력이 불가합니다. 내장 포매터로 대체합니다."),
        new Probe("dbms_xplan_cursor", "DBMS_XPLAN.DISPLAY_CURSOR", "plan",
            "SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'BASIC')) WHERE ROWNUM<2",
            "실제 실행된 계획(A-Rows 포함) 조회가 불가합니다. 예상계획(EXPLAIN PLAN)만 사용합니다."),
        new Probe("v$sql_plan", "V$SQL_PLAN", "plan",
            "SELECT COUNT(*) FROM v$sql_plan WHERE 1=0",
            "라이브러리 캐시의 실제 계획 조회가 불가합니다."),
        new Probe("v$sql_plan_stats", "V$SQL_PLAN_STATISTICS_ALL", "plan",
            "SELECT COUNT(*) FROM v$sql_plan_statistics_all WHERE 1=0",
            "행원천 실적(E-Rows vs A-Rows) 비교가 불가합니다."),

        // ── 런타임 계측 ──────────────────────────────────────────────────────
        new Probe("v$mystat", "V$MYSTAT", "runtime",
            "SELECT COUNT(*) FROM v$mystat WHERE 1=0",
            "세션 통계(논리읽기/물리읽기/정렬) 증분 계측이 불가합니다. 시간 측정만 사용합니다."),
        new Probe("v$statname", "V$STATNAME", "runtime",
            "SELECT COUNT(*) FROM v$statname WHERE 1=0",
            "세션 통계 이름 해석이 불가합니다."),
        new Probe("v$sql", "V$SQL", "runtime",
            "SELECT COUNT(*) FROM v$sql WHERE 1=0",
            "SQL_ID 기반 누적 통계(BUFFER_GETS 등) 조회가 불가합니다."),
        new Probe("v$session", "V$SESSION", "runtime",
            "SELECT COUNT(*) FROM v$session WHERE 1=0",
            "직전 실행 SQL_ID 확보가 불가합니다(DISPLAY_CURSOR 자동 연결 불가)."),
        new Probe("v$sql_monitor", "V$SQL_MONITOR", "runtime",
            "SELECT COUNT(*) FROM v$sql_monitor WHERE 1=0",
            "실시간 SQL 모니터링 리포트를 쓸 수 없습니다(Tuning Pack 필요)."),

        // ── 딕셔너리 ─────────────────────────────────────────────────────────
        new Probe("user_tables", "USER_TABLES", "dictionary",
            "SELECT COUNT(*) FROM user_tables WHERE 1=0",
            "내 소유 테이블 목록 조회가 불가합니다."),
        new Probe("all_tables", "ALL_TABLES", "dictionary",
            "SELECT COUNT(*) FROM all_tables WHERE 1=0",
            "접근 가능한 테이블 목록 조회가 불가합니다. JDBC 메타데이터로 대체합니다."),
        new Probe("dba_tables", "DBA_TABLES", "dictionary",
            "SELECT COUNT(*) FROM dba_tables WHERE 1=0",
            "전체 테이블 조회가 불가합니다(일반적으로 정상)."),
        new Probe("all_tab_columns", "ALL_TAB_COLUMNS", "dictionary",
            "SELECT COUNT(*) FROM all_tab_columns WHERE 1=0",
            "컬럼 정의 조회가 불가합니다. JDBC 메타데이터/쿼리 서술로 대체합니다."),
        new Probe("all_indexes", "ALL_INDEXES", "dictionary",
            "SELECT COUNT(*) FROM all_indexes WHERE 1=0",
            "인덱스 목록 조회가 불가합니다. 인덱스 관련 진단 정확도가 떨어집니다."),
        new Probe("all_ind_columns", "ALL_IND_COLUMNS", "dictionary",
            "SELECT COUNT(*) FROM all_ind_columns WHERE 1=0",
            "인덱스 구성 컬럼 조회가 불가합니다."),
        new Probe("all_constraints", "ALL_CONSTRAINTS", "dictionary",
            "SELECT COUNT(*) FROM all_constraints WHERE 1=0",
            "제약조건(PK/FK/NOT NULL) 조회가 불가합니다."),
        new Probe("all_tab_statistics", "ALL_TAB_STATISTICS", "dictionary",
            "SELECT COUNT(*) FROM all_tab_statistics WHERE 1=0",
            "테이블 통계(행수/최종분석일) 조회가 불가합니다."),
        new Probe("all_tab_col_statistics", "ALL_TAB_COL_STATISTICS", "dictionary",
            "SELECT COUNT(*) FROM all_tab_col_statistics WHERE 1=0",
            "컬럼 선택도(NDV/히스토그램) 조회가 불가합니다."),

        // ── 메타/기타 ────────────────────────────────────────────────────────
        new Probe("v$version", "V$VERSION", "meta",
            "SELECT banner FROM v$version WHERE ROWNUM<2",
            "V$ 기반 버전 조회 불가 — PRODUCT_COMPONENT_VERSION 으로 대체합니다."),
        new Probe("product_component_version", "PRODUCT_COMPONENT_VERSION", "meta",
            "SELECT version FROM product_component_version WHERE ROWNUM<2",
            "버전 조회 불가 — JDBC 메타데이터로 대체합니다."),
        new Probe("dbms_metadata", "DBMS_METADATA", "meta",
            "SELECT DBMS_METADATA.GET_DDL('TABLE','X','X') FROM dual WHERE 1=0",
            "DDL 원문 추출이 불가합니다."),
        new Probe("nls_session_parameters", "NLS_SESSION_PARAMETERS", "meta",
            "SELECT COUNT(*) FROM nls_session_parameters WHERE 1=0",
            "세션 NLS 설정 확인이 불가합니다.")
    };

    /**
     * 세션의 사용 가능 기능을 실측한다. 결과는 세션에 캐시된다.
     *
     * @param force true 면 캐시를 무시하고 다시 탐침
     */
    public static Map<String, Object> probe(Db.Session s, boolean force) {
        Connection c = s.conn;
        if (force || !s.capsProbed) {
            s.caps.clear();
            s.capMessages.clear();
            for (Probe p : PROBES) {
                String err = Sql.probe(c, p.sql, 5);
                s.caps.put(p.key, Boolean.valueOf(err == null));
                if (err != null) s.capMessages.put(p.key, err);
            }
            // EXPLAIN PLAN 자체는 위 탐침으로 알 수 없다 — 실제 한 번 돌려본다(부작용 없음, 즉시 삭제).
            String planTable = Plan.ensurePlanTable(s);
            s.planTable = planTable;
            s.caps.put("explain_plan", Boolean.valueOf(planTable != null));
            if (planTable == null) {
                s.capMessages.put("explain_plan", "EXPLAIN PLAN 을 저장할 계획 테이블을 확보하지 못했습니다.");
            }
            // 세션 통계 수준 변경 권한 (DISPLAY_CURSOR ALLSTATS 에 필요)
            String stErr = Sql.execQuiet(c, "ALTER SESSION SET statistics_level = TYPICAL", 5);
            s.caps.put("alter_session_stats", Boolean.valueOf(stErr == null));
            if (stErr != null) s.capMessages.put("alter_session_stats", stErr);

            s.capsProbed = true;
        }
        return report(s);
    }

    /** 탐침 결과를 UI 용 구조로 만든다. */
    public static Map<String, Object> report(Db.Session s) {
        Map<String, Object> out = Json.obj();
        List<Object> items = Json.arr();

        Map<String, Probe> byKey = new LinkedHashMap<String, Probe>();
        for (Probe p : PROBES) byKey.put(p.key, p);

        for (Map.Entry<String, Boolean> e : s.caps.entrySet()) {
            Probe p = byKey.get(e.getKey());
            Map<String, Object> m = Json.obj();
            m.put("key", e.getKey());
            m.put("label", p != null ? p.label : e.getKey());
            m.put("category", p != null ? p.category : "plan");
            m.put("available", e.getValue());
            m.put("impact", p != null ? p.impact : "");
            m.put("reason", s.capMessages.get(e.getKey()));
            items.add(m);
        }
        out.put("items", items);
        out.put("flags", new LinkedHashMap<String, Boolean>(s.caps));
        out.put("planTable", s.planTable);
        out.put("tiers", tiers(s));
        out.put("degraded", degradations(s));
        return out;
    }

    private static boolean on(Db.Session s, String k) {
        Boolean b = s.caps.get(k);
        return b != null && b.booleanValue();
    }

    /**
     * 사용 가능한 기능들을 "티어"로 요약한다. 화면 상단 배지와 검증 리포트가 이 값을 쓴다.
     */
    public static Map<String, Object> tiers(Db.Session s) {
        Map<String, Object> t = Json.obj();

        // 실행계획 확보 경로
        String plan;
        if (on(s, "explain_plan") && on(s, "dbms_xplan_display")) plan = "DBMS_XPLAN";
        else if (on(s, "explain_plan")) plan = "PLAN_TABLE";
        else plan = "NONE";
        t.put("plan", plan);
        t.put("planLabel", "DBMS_XPLAN".equals(plan) ? "표준 서식 실행계획"
            : "PLAN_TABLE".equals(plan) ? "계획 테이블 직접 조회(내장 포매터)"
            : "실행계획 없음 — 정적 분석/실측만 사용");

        // 실제 실행 계측 경로
        String rt;
        if (on(s, "dbms_xplan_cursor") && on(s, "v$session") && on(s, "v$sql_plan_stats")) rt = "ROWSOURCE_STATS";
        else if (on(s, "v$mystat") && on(s, "v$statname")) rt = "SESSION_STATS";
        else rt = "TIMING_ONLY";
        t.put("runtime", rt);
        t.put("runtimeLabel", "ROWSOURCE_STATS".equals(rt) ? "실제 실행계획 + 단계별 실적(A-Rows)"
            : "SESSION_STATS".equals(rt) ? "세션 통계 증분(논리/물리 읽기, 정렬)"
            : "경과시간·행수만 측정");

        // 딕셔너리 경로
        String dict;
        if (on(s, "dba_tables")) dict = "DBA";
        else if (on(s, "all_tables")) dict = "ALL";
        else if (on(s, "user_tables")) dict = "USER";
        else dict = "JDBC_ONLY";
        t.put("dictionary", dict);
        t.put("dictionaryLabel", "DBA".equals(dict) ? "DBA_ 딕셔너리 전체"
            : "ALL".equals(dict) ? "접근 가능 객체(ALL_)"
            : "USER".equals(dict) ? "내 소유 객체(USER_)만"
            : "딕셔너리 접근 불가 — JDBC 메타데이터/쿼리 서술만");

        return t;
    }

    /** 사용자에게 보여줄 "무엇이 제한되는가" 목록. */
    public static List<Object> degradations(Db.Session s) {
        List<Object> out = Json.arr();
        for (Probe p : PROBES) {
            Boolean b = s.caps.get(p.key);
            if (b != null && !b.booleanValue()) {
                Map<String, Object> m = Json.obj();
                m.put("key", p.key);
                m.put("label", p.label);
                m.put("impact", p.impact);
                m.put("reason", s.capMessages.get(p.key));
                out.add(m);
            }
        }
        return out;
    }

    /** 서버/세션 요약 정보(권한 없어도 최대한 채운다). */
    public static Map<String, Object> serverInfo(Db.Session s) {
        Map<String, Object> m = Json.obj();
        m.put("sessionId", s.id);
        m.put("url", s.url);
        m.put("user", s.user);
        m.put("driver", s.driverInfo);
        try {
            java.sql.DatabaseMetaData md = s.conn.getMetaData();
            m.put("databaseProduct", md.getDatabaseProductName());
            m.put("databaseVersion", md.getDatabaseProductVersion());
            m.put("jdbcVersion", md.getDriverVersion());
            m.put("schema", safeSchema(s));
        } catch (Exception e) {
            m.put("metaError", String.valueOf(e.getMessage()));
        }
        Object banner = Sql.scalarQuiet(s.conn, "SELECT banner FROM v$version WHERE ROWNUM<2");
        if (banner == null) banner = Sql.scalarQuiet(s.conn,
            "SELECT product||' '||version FROM product_component_version WHERE ROWNUM<2");
        m.put("banner", banner);
        m.put("sid", Sql.scalarQuiet(s.conn, "SELECT SYS_CONTEXT('USERENV','SID') FROM dual"));
        m.put("instance", Sql.scalarQuiet(s.conn, "SELECT SYS_CONTEXT('USERENV','INSTANCE_NAME') FROM dual"));
        m.put("dbName", Sql.scalarQuiet(s.conn, "SELECT SYS_CONTEXT('USERENV','DB_NAME') FROM dual"));
        m.put("currentSchema", Sql.scalarQuiet(s.conn, "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM dual"));
        m.put("serverTime", Sql.scalarQuiet(s.conn, "SELECT TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS') FROM dual"));
        List<Object> nls = new ArrayList<Object>();
        try {
            List<Map<String, Object>> rows = Sql.query(s.conn,
                "SELECT parameter, value FROM nls_session_parameters " +
                "WHERE parameter IN ('NLS_LANGUAGE','NLS_TERRITORY','NLS_CHARACTERSET','NLS_DATE_FORMAT','NLS_SORT','NLS_COMP')",
                null, 50, 5);
            nls.addAll(rows);
        } catch (Exception ignore) { }
        m.put("nls", nls);
        return m;
    }

    private static String safeSchema(Db.Session s) {
        try {
            String sc = s.conn.getSchema();
            if (sc != null) return sc;
        } catch (Throwable ignore) { }
        Object o = Sql.scalarQuiet(s.conn, "SELECT USER FROM dual");
        return o == null ? null : String.valueOf(o);
    }
}
