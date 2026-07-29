package kr.foxnail.otuner;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 실행계획 확보 — <b>가능한 경로 중 가장 좋은 것</b>으로 자동 강등한다.
 *
 * <pre>
 *  1순위  EXPLAIN PLAN → DBMS_XPLAN.DISPLAY        (표준 서식 텍스트 + 구조화 행)
 *  2순위  EXPLAIN PLAN → 계획 테이블 직접 조회      (내장 포매터로 트리 구성)
 *  3순위  DBMS_XPLAN.DISPLAY_CURSOR                (실제 실행된 계획, V$ 필요)
 *  4순위  없음                                      (정적 분석 + 실측 시간만으로 진행)
 * </pre>
 *
 * 계획 테이블이 아예 없으면 개인용 {@code OT_PLAN_TABLE} 생성을 한 번 시도한다.
 * 그것마저 막혀 있으면 계획 없이 동작한다(요구사항: "가능한 만큼만").
 */
public final class Plan {

    private Plan() {}

    private static final AtomicLong STMT_SEQ = new AtomicLong(1);

    /** 계획 테이블 후보 — 앞에서부터 시도. */
    private static final String[] CANDIDATES = { "PLAN_TABLE", "SYS.PLAN_TABLE$", "OT_PLAN_TABLE" };

    /** 개인용 계획 테이블 DDL (utlxplan.sql 축약판 — 필수 컬럼만). */
    private static final String CREATE_DDL =
        "CREATE TABLE OT_PLAN_TABLE (" +
        " statement_id VARCHAR2(30), plan_id NUMBER, timestamp DATE, remarks VARCHAR2(4000)," +
        " operation VARCHAR2(30), options VARCHAR2(255), object_node VARCHAR2(128), object_owner VARCHAR2(128)," +
        " object_name VARCHAR2(128), object_alias VARCHAR2(261), object_instance NUMBER, object_type VARCHAR2(30)," +
        " optimizer VARCHAR2(255), search_columns NUMBER, id NUMBER, parent_id NUMBER, depth NUMBER, position NUMBER," +
        " cost NUMBER, cardinality NUMBER, bytes NUMBER, other_tag VARCHAR2(255), partition_start VARCHAR2(255)," +
        " partition_stop VARCHAR2(255), partition_id NUMBER, other LONG, distribution VARCHAR2(30)," +
        " cpu_cost NUMBER, io_cost NUMBER, temp_space NUMBER, access_predicates VARCHAR2(4000)," +
        " filter_predicates VARCHAR2(4000), projection VARCHAR2(4000), time NUMBER, qblock_name VARCHAR2(128))";

    /**
     * 이 세션에서 쓸 계획 테이블을 확보한다. 실제로 EXPLAIN PLAN 을 한 번 돌려 검증한다.
     * @return 사용 가능한 테이블명, 없으면 null
     */
    public static String ensurePlanTable(Db.Session s) {
        String probeId = "OTPROBE" + STMT_SEQ.getAndIncrement();
        for (String t : CANDIDATES) {
            if (tryExplainInto(s.conn, t, probeId, "SELECT 1 FROM dual")) {
                cleanup(s.conn, t, probeId);
                return t;
            }
        }
        // 마지막 수단: 개인 계획 테이블 생성
        String err = Sql.execQuiet(s.conn, CREATE_DDL, 15);
        if (err == null) {
            try { s.conn.commit(); } catch (SQLException ignore) { }
            if (tryExplainInto(s.conn, "OT_PLAN_TABLE", probeId, "SELECT 1 FROM dual")) {
                cleanup(s.conn, "OT_PLAN_TABLE", probeId);
                return "OT_PLAN_TABLE";
            }
        }
        return null;
    }

    private static boolean tryExplainInto(Connection c, String table, String stmtId, String sql) {
        String err = Sql.execQuiet(c,
            "EXPLAIN PLAN SET STATEMENT_ID = " + Sql.quoteLit(stmtId) + " INTO " + table + " FOR " + sql, 15);
        return err == null;
    }

    private static void cleanup(Connection c, String table, String stmtId) {
        Sql.execQuiet(c, "DELETE FROM " + table + " WHERE statement_id = " + Sql.quoteLit(stmtId), 10);
        try { c.commit(); } catch (SQLException ignore) { }
    }

    /**
     * 예상 실행계획(EXPLAIN PLAN)을 뽑는다.
     *
     * @param sqlText 실행하지 않고 계획만 뽑을 SQL (세미콜론은 제거해서 넘길 것)
     * @return {available, source, rows[], text, error, note}
     */
    public static Map<String, Object> explain(Db.Session s, String sqlText) {
        Map<String, Object> out = Json.obj();
        out.put("rows", Json.arr());
        String table = s.planTable;
        if (table == null) {
            table = ensurePlanTable(s);
            s.planTable = table;
        }
        if (table == null) {
            out.put("available", Boolean.FALSE);
            out.put("source", "NONE");
            out.put("error", "계획 테이블을 확보할 수 없습니다(PLAN_TABLE 접근 불가 + 생성 권한 없음).");
            out.put("note", "정적 분석과 실행 실측만으로 튜닝을 진행합니다.");
            return out;
        }

        String stmtId = "OT" + STMT_SEQ.getAndIncrement();
        String cleaned = stripTrailingSemicolon(sqlText);
        String err = Sql.execQuiet(s.conn,
            "EXPLAIN PLAN SET STATEMENT_ID = " + Sql.quoteLit(stmtId) + " INTO " + table + " FOR " + cleaned, 30);
        if (err != null) {
            out.put("available", Boolean.FALSE);
            out.put("source", "NONE");
            out.put("error", err);
            out.put("ora", Db.oraCode(err));
            return out;
        }

        try {
            List<Map<String, Object>> rows = readPlanRows(s.conn, table, stmtId);
            out.put("rows", rows);
            out.put("available", Boolean.valueOf(!rows.isEmpty()));
            out.put("planTable", table);
            out.put("statementId", stmtId);
            out.put("summary", summarize(rows));

            // 표준 서식 텍스트 시도
            String text = displayText(s.conn, table, stmtId);
            if (text != null) {
                out.put("text", text);
                out.put("source", "DBMS_XPLAN");
            } else {
                out.put("text", formatPlan(rows));
                out.put("source", "PLAN_TABLE");
                out.put("note", "DBMS_XPLAN 사용 불가 — 내장 포매터로 출력했습니다.");
            }
        } catch (SQLException e) {
            out.put("available", Boolean.FALSE);
            out.put("source", "NONE");
            out.put("error", e.getMessage());
        } finally {
            cleanup(s.conn, table, stmtId);
        }
        return out;
    }

    /** 계획 테이블 스키마가 버전마다 달라 {@code SELECT *} 로 읽고 있는 컬럼만 매핑한다. */
    private static List<Map<String, Object>> readPlanRows(Connection c, String table, String stmtId) throws SQLException {
        PreparedStatement ps = null;
        ResultSet rs = null;
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        try {
            ps = c.prepareStatement("SELECT * FROM " + table + " WHERE statement_id = ? ORDER BY NVL(id,0)");
            ps.setString(1, stmtId);
            ps.setQueryTimeout(20);
            rs = ps.executeQuery();
            ResultSetMetaData md = rs.getMetaData();
            int n = md.getColumnCount();
            while (rs.next()) {
                Map<String, Object> row = new LinkedHashMap<String, Object>();
                for (int i = 1; i <= n; i++) {
                    String name = md.getColumnLabel(i).toLowerCase();
                    if ("other".equals(name) || "other_xml".equals(name)) continue; // LONG/CLOB — 생략
                    row.put(name, Sql.value(rs, i, md.getColumnType(i)));
                }
                decorate(row);
                out.add(row);
            }
        } finally {
            Sql.close(rs);
            Sql.close(ps);
        }
        return out;
    }

    /** 그리드 표시에 바로 쓸 파생 필드를 붙인다. */
    private static void decorate(Map<String, Object> row) {
        Object op = row.get("operation");
        Object opt = row.get("options");
        String operation = op == null ? "" : String.valueOf(op);
        String options = opt == null ? "" : String.valueOf(opt);
        String full = operation + (options.isEmpty() ? "" : " " + options);
        row.put("opFull", full);

        int depth = num(row.get("depth"));
        StringBuilder pad = new StringBuilder();
        for (int i = 0; i < depth; i++) pad.append("  ");
        row.put("opIndented", pad + full);

        Object obj = row.get("object_name");
        Object owner = row.get("object_owner");
        row.put("objFull", obj == null ? "" : ((owner == null ? "" : owner + ".") + obj));

        // 위험 신호 태깅 — UI 색상과 규칙엔진 입력으로 쓴다
        List<Object> tags = Json.arr();
        String u = full.toUpperCase();
        if (u.startsWith("TABLE ACCESS FULL")) tags.add("FULL_SCAN");
        if (u.contains("INDEX FULL SCAN")) tags.add("INDEX_FULL_SCAN");
        if (u.contains("INDEX SKIP SCAN")) tags.add("INDEX_SKIP_SCAN");
        if (u.contains("MERGE JOIN CARTESIAN")) tags.add("CARTESIAN");
        if (u.contains("SORT ORDER BY")) tags.add("SORT");
        if (u.contains("HASH JOIN")) tags.add("HASH_JOIN");
        if (u.contains("NESTED LOOPS")) tags.add("NESTED_LOOPS");
        if (u.contains("VIEW PUSHED PREDICATE")) tags.add("PUSHED_PREDICATE");
        if (u.contains("FILTER")) tags.add("FILTER");
        if (u.contains("REMOTE")) tags.add("REMOTE");
        if (u.contains("PARTITION")) tags.add("PARTITION");
        row.put("tags", tags);
    }

    private static int num(Object o) {
        if (o instanceof Number) return ((Number) o).intValue();
        if (o instanceof String) {
            try { return (int) Double.parseDouble((String) o); } catch (NumberFormatException e) { return 0; }
        }
        return 0;
    }

    private static double dnum(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        if (o instanceof String) {
            try { return Double.parseDouble((String) o); } catch (NumberFormatException e) { return 0; }
        }
        return 0;
    }

    /** DBMS_XPLAN.DISPLAY 텍스트. 권한 없으면 null. */
    private static String displayText(Connection c, String table, String stmtId) {
        String tbl = table.contains(".") ? table.substring(table.indexOf('.') + 1) : table;
        String sql = "SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY(" +
            Sql.quoteLit(tbl) + ", " + Sql.quoteLit(stmtId) + ", 'ALL'))";
        try {
            List<Map<String, Object>> rows = Sql.query(c, sql, null, 500, 20);
            if (rows.isEmpty()) return null;
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> r : rows) {
                Object v = r.values().iterator().next();
                sb.append(v == null ? "" : String.valueOf(v)).append('\n');
            }
            return sb.toString();
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * 실제 실행된 계획(DISPLAY_CURSOR). 직전에 이 세션이 실행한 SQL 을 대상으로 한다.
     * V$SESSION / DBMS_XPLAN 권한이 필요하며, 없으면 available=false 로 조용히 반환한다.
     */
    public static Map<String, Object> displayCursor(Db.Session s, String format) {
        Map<String, Object> out = Json.obj();
        out.put("available", Boolean.FALSE);
        String fmt = (format == null || format.trim().isEmpty()) ? "ALLSTATS LAST +COST +BYTES" : format;
        try {
            Object sqlId = Sql.scalar(s.conn,
                "SELECT prev_sql_id FROM v$session WHERE sid = SYS_CONTEXT('USERENV','SID')", null, 5);
            Object child = Sql.scalar(s.conn,
                "SELECT prev_child_number FROM v$session WHERE sid = SYS_CONTEXT('USERENV','SID')", null, 5);
            if (sqlId == null) {
                out.put("error", "직전 SQL_ID 를 찾지 못했습니다(V$SESSION 접근 불가 또는 커서 미보존).");
                return out;
            }
            out.put("sqlId", sqlId);
            out.put("childNumber", child);
            List<Map<String, Object>> rows = Sql.query(s.conn,
                "SELECT plan_table_output FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(" +
                Sql.quoteLit(String.valueOf(sqlId)) + ", " + (child == null ? "NULL" : String.valueOf(num(child))) +
                ", " + Sql.quoteLit(fmt) + "))", null, 800, 20);
            if (rows.isEmpty()) {
                out.put("error", "커서 계획이 조회되지 않았습니다(공유풀에서 밀려났을 수 있습니다).");
                return out;
            }
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> r : rows) {
                Object v = r.values().iterator().next();
                sb.append(v == null ? "" : String.valueOf(v)).append('\n');
            }
            out.put("available", Boolean.TRUE);
            out.put("text", sb.toString());
            out.put("source", "DISPLAY_CURSOR");

            // 행원천 실적(선택)
            try {
                List<Map<String, Object>> st = Sql.query(s.conn,
                    "SELECT id, parent_id, depth, operation, options, object_name, cardinality AS e_rows, " +
                    "       last_output_rows AS a_rows, last_cr_buffer_gets AS cr_gets, " +
                    "       last_disk_reads AS disk_reads, last_elapsed_time AS elapsed_us, starts " +
                    "  FROM v$sql_plan_statistics_all " +
                    " WHERE sql_id = ? AND child_number = ? ORDER BY id",
                    new Object[] { String.valueOf(sqlId), Integer.valueOf(num(child)) }, 500, 15);
                out.put("rowsourceStats", st);
            } catch (Throwable ignore) { }
        } catch (Throwable t) {
            out.put("error", String.valueOf(t.getMessage()));
        }
        return out;
    }

    /** V$SQL 누적 통계(있으면). */
    public static Map<String, Object> sqlStats(Db.Session s, String sqlId) {
        Map<String, Object> out = Json.obj();
        out.put("available", Boolean.FALSE);
        try {
            String id = sqlId;
            if (id == null || id.trim().isEmpty()) {
                Object o = Sql.scalar(s.conn,
                    "SELECT prev_sql_id FROM v$session WHERE sid = SYS_CONTEXT('USERENV','SID')", null, 5);
                if (o == null) { out.put("error", "SQL_ID 를 확보할 수 없습니다."); return out; }
                id = String.valueOf(o);
            }
            List<Map<String, Object>> rows = Sql.query(s.conn,
                "SELECT sql_id, child_number, plan_hash_value, executions, " +
                "       ROUND(elapsed_time/GREATEST(executions,1)/1000, 3) AS avg_elapsed_ms, " +
                "       ROUND(cpu_time/GREATEST(executions,1)/1000, 3) AS avg_cpu_ms, " +
                "       ROUND(buffer_gets/GREATEST(executions,1), 1) AS avg_buffer_gets, " +
                "       ROUND(disk_reads/GREATEST(executions,1), 1) AS avg_disk_reads, " +
                "       ROUND(rows_processed/GREATEST(executions,1), 1) AS avg_rows, " +
                "       optimizer_cost, optimizer_mode, first_load_time, last_active_time " +
                "  FROM v$sql WHERE sql_id = ? ORDER BY child_number",
                new Object[] { id }, 50, 10);
            out.put("sqlId", id);
            out.put("rows", rows);
            out.put("available", Boolean.valueOf(!rows.isEmpty()));
        } catch (Throwable t) {
            out.put("error", String.valueOf(t.getMessage()));
        }
        return out;
    }

    // ── 내장 포매터 ───────────────────────────────────────────────────────────

    /**
     * DBMS_XPLAN 이 없을 때 쓰는 계획 텍스트 포매터.
     * 표준 서식과 비슷하게 Id/Operation/Name/Rows/Bytes/Cost 를 정렬한다.
     */
    public static String formatPlan(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) return "(실행계획 없음)";
        int wOp = 9, wName = 4, wRows = 4, wBytes = 5, wCost = 4;
        List<String[]> cells = new ArrayList<String[]>();
        for (Map<String, Object> r : rows) {
            String id = String.valueOf(num(r.get("id")));
            String op = str(r.get("opIndented"));
            String name = str(r.get("object_name"));
            String card = fmtNum(r.get("cardinality"));
            String bytes = fmtNum(r.get("bytes"));
            String cost = fmtNum(r.get("cost"));
            String time = str(r.get("time"));
            cells.add(new String[] { id, op, name, card, bytes, cost, time });
            wOp = Math.max(wOp, op.length());
            wName = Math.max(wName, name.length());
            wRows = Math.max(wRows, card.length());
            wBytes = Math.max(wBytes, bytes.length());
            wCost = Math.max(wCost, cost.length());
        }
        StringBuilder sb = new StringBuilder();
        String sep = "-" + rep('-', 5) + "+" + rep('-', wOp + 2) + "+" + rep('-', wName + 2) + "+" +
            rep('-', wRows + 2) + "+" + rep('-', wBytes + 2) + "+" + rep('-', wCost + 2) + "+";
        sb.append(sep).append('\n');
        sb.append("| Id  | ").append(pad("Operation", wOp)).append(" | ").append(pad("Name", wName))
          .append(" | ").append(padL("Rows", wRows)).append(" | ").append(padL("Bytes", wBytes))
          .append(" | ").append(padL("Cost", wCost)).append(" |\n");
        sb.append(sep).append('\n');
        for (String[] c : cells) {
            sb.append("| ").append(padL(c[0], 3)).append(" | ").append(pad(c[1], wOp)).append(" | ")
              .append(pad(c[2], wName)).append(" | ").append(padL(c[3], wRows)).append(" | ")
              .append(padL(c[4], wBytes)).append(" | ").append(padL(c[5], wCost)).append(" |\n");
        }
        sb.append(sep).append('\n');

        // 술어(Predicate) 정보
        StringBuilder pred = new StringBuilder();
        for (Map<String, Object> r : rows) {
            String acc = str(r.get("access_predicates"));
            String fil = str(r.get("filter_predicates"));
            String id = String.valueOf(num(r.get("id")));
            if (!acc.isEmpty()) pred.append("   ").append(id).append(" - access(").append(acc).append(")\n");
            if (!fil.isEmpty()) pred.append("   ").append(id).append(" - filter(").append(fil).append(")\n");
        }
        if (pred.length() > 0) {
            sb.append("\nPredicate Information (identified by operation id):\n");
            sb.append("---------------------------------------------------\n");
            sb.append(pred);
        }
        sb.append("\n※ DBMS_XPLAN 사용 권한이 없어 내장 포매터로 출력했습니다.\n");
        return sb.toString();
    }

    /** 계획 요약치(비교·판정용). */
    public static Map<String, Object> summarize(List<Map<String, Object>> rows) {
        Map<String, Object> m = Json.obj();
        if (rows == null || rows.isEmpty()) return m;
        double totalCost = 0, rootCard = 0, rootBytes = 0;
        int fullScans = 0, cartesian = 0, indexScans = 0, sorts = 0, hashJoins = 0, nestedLoops = 0;
        List<Object> objects = Json.arr();
        for (Map<String, Object> r : rows) {
            if (num(r.get("id")) == 0) {
                totalCost = dnum(r.get("cost"));
                rootCard = dnum(r.get("cardinality"));
                rootBytes = dnum(r.get("bytes"));
            }
            String full = str(r.get("opFull")).toUpperCase();
            if (full.startsWith("TABLE ACCESS FULL")) fullScans++;
            if (full.contains("MERGE JOIN CARTESIAN")) cartesian++;
            if (full.startsWith("INDEX")) indexScans++;
            if (full.startsWith("SORT")) sorts++;
            if (full.contains("HASH JOIN")) hashJoins++;
            if (full.contains("NESTED LOOPS")) nestedLoops++;
            String on = str(r.get("object_name"));
            if (!on.isEmpty() && !objects.contains(on)) objects.add(on);
        }
        m.put("totalCost", Double.valueOf(totalCost));
        m.put("estimatedRows", Double.valueOf(rootCard));
        m.put("estimatedBytes", Double.valueOf(rootBytes));
        m.put("steps", Integer.valueOf(rows.size()));
        m.put("fullScans", Integer.valueOf(fullScans));
        m.put("cartesian", Integer.valueOf(cartesian));
        m.put("indexScans", Integer.valueOf(indexScans));
        m.put("sorts", Integer.valueOf(sorts));
        m.put("hashJoins", Integer.valueOf(hashJoins));
        m.put("nestedLoops", Integer.valueOf(nestedLoops));
        m.put("objects", objects);
        return m;
    }

    /**
     * JDBC 로 보내기 전 문장 끝을 정리한다.
     *
     * <p>⚠ <b>PL/SQL 블록은 예외</b>다. {@code END;} 의 세미콜론은 SQL*Plus 종결자가 아니라
     * <b>PL/SQL 문법의 일부</b>이므로 지우면 PLS-00103 (심볼 ';' 이 필요) 오류가 난다.
     * 일반 SQL 은 반대로 세미콜론이 붙으면 ORA-00911 이 나므로 지워야 한다.
     */
    static String stripTrailingSemicolon(String sql) {
        String s = sql == null ? "" : sql.trim();
        // SQL*Plus 종결 슬래시(단독 '/')를 먼저 떼어낸다
        while (s.endsWith("/") && (s.length() < 2 || s.charAt(s.length() - 2) == '\n' || s.charAt(s.length() - 2) == '\r')) {
            s = s.substring(0, s.length() - 1).trim();
        }
        if (isPlsqlBlock(s)) return s;   // END; 의 세미콜론을 살려 둔다
        while (s.endsWith(";")) s = s.substring(0, s.length() - 1).trim();
        return s;
    }

    /**
     * PL/SQL 블록인가? 앞쪽 주석과 공백을 건너뛰고 첫 키워드로 판정한다.
     * BEGIN / DECLARE, 그리고 CREATE [OR REPLACE] PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE 를 인식한다.
     */
    static boolean isPlsqlBlock(String sql) {
        if (sql == null) return false;
        int i = skipCommentsAndSpace(sql, 0);
        String w1 = wordAt(sql, i);
        if (w1.isEmpty()) return false;
        if (w1.equals("BEGIN") || w1.equals("DECLARE")) return true;
        if (!w1.equals("CREATE")) return false;

        i = skipCommentsAndSpace(sql, i + w1.length());
        String w2 = wordAt(sql, i);
        if (w2.equals("OR")) {                       // CREATE OR REPLACE ...
            i = skipCommentsAndSpace(sql, i + w2.length());
            String w3 = wordAt(sql, i);              // REPLACE
            i = skipCommentsAndSpace(sql, i + w3.length());
            w2 = wordAt(sql, i);
        }
        return w2.equals("PROCEDURE") || w2.equals("FUNCTION") || w2.equals("PACKAGE")
            || w2.equals("TRIGGER") || w2.equals("TYPE");
    }

    /** 공백과 주석(-- , 슬래시-별표)을 건너뛴 다음 위치. */
    private static int skipCommentsAndSpace(String s, int i) {
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c)) { i++; continue; }
            if (c == '-' && i + 1 < n && s.charAt(i + 1) == '-') {
                while (i < n && s.charAt(i) != '\n') i++;
                continue;
            }
            if (c == '/' && i + 1 < n && s.charAt(i + 1) == '*') {
                i += 2;
                while (i + 1 < n && !(s.charAt(i) == '*' && s.charAt(i + 1) == '/')) i++;
                i = Math.min(n, i + 2);
                continue;
            }
            break;
        }
        return i;
    }

    /** 위치 i 에서 시작하는 영문 단어를 대문자로. */
    private static String wordAt(String s, int i) {
        int j = i;
        while (j < s.length() && Character.isLetter(s.charAt(j))) j++;
        return s.substring(i, j).toUpperCase();
    }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }

    private static String fmtNum(Object o) {
        if (o == null) return "";
        double d = dnum(o);
        if (d == 0 && !(o instanceof Number)) return String.valueOf(o);
        if (d >= 1e12) return Math.round(d / 1e12) + "T";
        if (d >= 1e9) return Math.round(d / 1e9) + "G";
        if (d >= 1e6) return Math.round(d / 1e6) + "M";
        if (d >= 1e3) return Math.round(d / 1e3) + "K";
        return String.valueOf((long) d);
    }

    private static String pad(String s, int w) {
        StringBuilder sb = new StringBuilder(s == null ? "" : s);
        while (sb.length() < w) sb.append(' ');
        return sb.toString();
    }

    private static String padL(String s, int w) {
        StringBuilder sb = new StringBuilder();
        String v = s == null ? "" : s;
        for (int i = v.length(); i < w; i++) sb.append(' ');
        return sb + v;
    }

    private static String rep(char c, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(c);
        return sb.toString();
    }
}
