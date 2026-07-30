package kr.foxnail.otuner;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SQL 실행 · 계측 · 결과 동일성 검증.
 *
 * <p><b>계측 원칙</b>
 * <ul>
 *   <li>시간은 prepare / execute / fetch 를 나눠 잰다. "빨라졌다"가 파싱 때문인지 실행 때문인지 구분해야 한다.</li>
 *   <li>V$MYSTAT 을 볼 수 있으면 세션 통계 증분(논리읽기·물리읽기·정렬)을 함께 잰다.
 *       <b>시간은 장비 상태에 흔들리지만 논리읽기는 거의 결정적</b>이라 튜닝 판정의 1차 근거로 쓴다.</li>
 *   <li>못 보면 조용히 시간 측정만으로 강등한다(권한 없는 환경 요구사항).</li>
 * </ul>
 *
 * <p><b>동일성 검증 원칙</b> — 튜닝 전후 SQL 이 같은 결과를 내는지는 DB 내부 권한과 무관하게
 * 항상 확인할 수 있어야 한다. 그래서 결과 행을 정규화해 SHA-256 지문을 두 가지로 만든다.
 * <ul>
 *   <li>ordered: 행 순서를 포함한 지문 → ORDER BY 까지 동일한지</li>
 *   <li>unordered: 행별 지문을 정렬해 합친 지문 → 집합(중복 포함)으로 동일한지</li>
 * </ul>
 */
public final class Exec {

    private Exec() {}

    /**
     * 지문 계산에서 컬럼 값을 가르는 구분자(U+001F UNIT SEPARATOR).
     * 데이터에 나타날 일이 없는 제어문자라야 "a|b" 와 "a","|b" 가 같은 지문이 되는 사고를 막는다.
     */
    private static final char UNIT_SEP = '\u001F';
    /** NULL 을 빈 문자열과 구분하기 위한 표식. */
    private static final String NULL_MARK = "\u0000NULL";

    /** maxRows 로 허용하는 절대 상한. 성능평가를 위해 200만 행까지 소비를 허용한다. */
    private static final int MAX_ROWS_CAP = 2_000_000;
    /** 응답에 보관하는 행수의 기본 상한. 이걸 넘는 행은 소비만 하고 버린다(메모리 보호). */
    private static final int DEFAULT_KEEP_ROWS_MAX = 5_000;

    /** 세션 통계 중 튜닝 판단에 쓰는 항목. */
    private static final String[] STAT_NAMES = {
        "session logical reads", "consistent gets", "db block gets", "physical reads",
        "physical reads direct", "db block changes", "redo size",
        "sorts (memory)", "sorts (disk)", "sorts (rows)",
        "table scans (short tables)", "table scans (long tables)",
        "table fetch by rowid", "table fetch continued row",
        "index fast full scans (full)", "CPU used by this session",
        "user I/O wait time", "parse count (total)", "parse count (hard)", "execute count",
        "bytes sent via SQL*Net to client"
    };

    private static String statInList() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < STAT_NAMES.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(Sql.quoteLit(STAT_NAMES[i]));
        }
        return sb.toString();
    }

    // ── 세션 통계 ────────────────────────────────────────────────────────────

    /** V$MYSTAT 스냅샷. 권한 없으면 null. */
    public static Map<String, Long> statSnapshot(Db.Session s) {
        Boolean my = s.caps.get("v$mystat");
        Boolean nm = s.caps.get("v$statname");
        if (my != null && !my.booleanValue()) return null;
        if (nm != null && !nm.booleanValue()) return null;
        try {
            List<Map<String, Object>> rows = Sql.query(s.conn,
                "SELECT n.name, s.value FROM v$mystat s, v$statname n " +
                " WHERE s.statistic# = n.statistic# AND n.name IN (" + statInList() + ")",
                null, 200, 5);
            Map<String, Long> m = new LinkedHashMap<String, Long>();
            for (Map<String, Object> r : rows) {
                Object n = r.get("name"), v = r.get("value");
                if (n == null) continue;
                m.put(String.valueOf(n), Long.valueOf(v == null ? 0 : (long) toDouble(v)));
            }
            return m.isEmpty() ? null : m;
        } catch (Throwable t) {
            return null;
        }
    }

    private static Map<String, Object> statDelta(Map<String, Long> before, Map<String, Long> after) {
        if (before == null || after == null) return null;
        Map<String, Object> d = Json.obj();
        for (Map.Entry<String, Long> e : after.entrySet()) {
            Long b = before.get(e.getKey());
            long delta = e.getValue().longValue() - (b == null ? 0 : b.longValue());
            if (delta != 0) d.put(e.getKey(), Long.valueOf(delta));
        }
        return d;
    }

    private static double toDouble(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    // ── 실행 ─────────────────────────────────────────────────────────────────

    /**
     * SQL 한 개를 실행하고 계측한다.
     *
     * <p>params:
     * <pre>
     *   sql            실행할 SQL (세미콜론 제거됨)
     *   binds          바인드 값 배열(순서대로). 이름 바인드도 위치로 매핑한다.
     *   maxRows        최대 인출(소비) 행수 (기본 5000, 0=무제한은 허용하지 않음 → MAX_ROWS_CAP(200만) 캡)
     *   fetchSize      JDBC fetch size (기본 1000) — 네트워크 왕복 영향 축소
     *   timeoutSec     질의 타임아웃 (기본 60)
     *   collectStats   세션 통계 수집 여부 (기본 true)
     *   hashResult     결과 지문 계산 여부 (기본 true)
     *   keepRows       행을 반환할지 (기본 true). 벤치마크에서는 false 로 두어 메모리를 아낀다.
     *   keepRowsMax    응답에 보관(retain)할 행수 상한 (기본 DEFAULT_KEEP_ROWS_MAX=5000).
     *                  maxRows(소비 상한)와 분리된 개념 — 이걸 넘는 행은 소비만 하고 버린다.
     *   gatherPlanStats /*+ gather_plan_statistics *&#47; 힌트 주입 여부
     *   safeMode       DML/DDL 이면 실행 후 자동 롤백 (기본 true)
     * </pre>
     */
    public static Map<String, Object> execute(Db.Session s, Map<String, Object> params) throws SQLException {
        String sql = Plan.stripTrailingSemicolon(Json.str(params, "sql", ""));
        if (sql.isEmpty()) throw new SQLException("실행할 SQL 이 비어 있습니다.");

        boolean gather = Json.bool(params, "gatherPlanStats", false);
        if (gather) sql = injectHint(sql, "gather_plan_statistics");

        /*
         * fullFetch — 결과를 <b>끝까지</b> 인출한다(행은 버린다).
         *
         * 성능 측정에서 이것이 결정적이다. maxRows 로 잘라 읽으면 "전체 스캔 30만 건"의
         * 비용이 중간에 끊겨, 튜닝 전/후가 <b>둘 다 빨라 보이는</b> 착시가 생긴다.
         * 실제 부하를 재려면 질의가 만들어 내는 행을 모두 소비해야 한다.
         */
        boolean fullFetch = Json.bool(params, "fullFetch", false);
        int maxRows = Json.intv(params, "maxRows", 5000);
        if (fullFetch) maxRows = Integer.MAX_VALUE;
        else if (maxRows <= 0 || maxRows > MAX_ROWS_CAP) maxRows = MAX_ROWS_CAP;
        int fetchSize = Json.intv(params, "fetchSize", 1000);
        int timeoutSec = Json.intv(params, "timeoutSec", 60);
        boolean collectStats = Json.bool(params, "collectStats", true);
        boolean hashResult = Json.bool(params, "hashResult", true);
        boolean keepRows = Json.bool(params, "keepRows", true);
        int keepRowsMax = Json.intv(params, "keepRowsMax", DEFAULT_KEEP_ROWS_MAX);
        if (keepRowsMax < 0) keepRowsMax = 0;
        boolean safeMode = Json.bool(params, "safeMode", true);
        Object[] binds = bindArray(params.get("binds"));

        Map<String, Object> out = Json.obj();
        // 초대형 SQL(수 MB)을 응답에 그대로 되돌리면 트래픽이 배로 든다. 클라이언트는 이미
        // 원문을 가지고 있으므로 길이만 알려준다.
        out.put("sqlLength", Integer.valueOf(sql.length()));

        Map<String, Long> statBefore = collectStats ? statSnapshot(s) : null;

        PreparedStatement ps = null;
        ResultSet rs = null;
        long t0 = System.nanoTime(), t1 = t0, t2 = t0, t3 = t0;
        try {
            ps = s.conn.prepareStatement(sql, ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY);
            Sql.bind(ps, binds);
            ps.setFetchSize(fetchSize > 0 ? fetchSize : 1000);
            // fullFetch 면 상한을 걸지 않는다(끝까지 읽어야 실제 비용이 측정된다)
            if (!fullFetch) ps.setMaxRows(maxRows + 1); // 잘림 판정을 위해 1행 더
            if (timeoutSec > 0) ps.setQueryTimeout(timeoutSec);
            s.running = ps;
            t1 = System.nanoTime();

            boolean hasResult = ps.execute();
            t2 = System.nanoTime();

            if (hasResult) {
                rs = ps.getResultSet();
                Map<String, Object> body = fetch(rs, maxRows, keepRows, keepRowsMax, hashResult);
                t3 = System.nanoTime();
                out.putAll(body);
                out.put("kind", "query");
            } else {
                int affected = ps.getUpdateCount();
                t3 = System.nanoTime();
                out.put("kind", "update");
                out.put("affectedRows", Integer.valueOf(affected));
                out.put("columns", Json.arr());
                out.put("rows", Json.arr());
                out.put("rowCount", Integer.valueOf(0));
                if (safeMode) {
                    try { s.conn.rollback(); out.put("rolledBack", Boolean.TRUE); }
                    catch (SQLException e) { out.put("rollbackError", e.getMessage()); }
                } else {
                    out.put("rolledBack", Boolean.FALSE);
                }
            }
        } finally {
            s.running = null;
            Sql.close(rs);
            Sql.close(ps);
        }

        Map<String, Object> timings = Json.obj();
        timings.put("prepareMs", ms(t0, t1));
        timings.put("executeMs", ms(t1, t2));
        timings.put("fetchMs", ms(t2, t3));
        timings.put("totalMs", ms(t0, t3));
        out.put("timings", timings);

        if (collectStats) {
            Map<String, Long> after = statSnapshot(s);
            Map<String, Object> delta = statDelta(statBefore, after);
            out.put("stats", delta);
            out.put("statsAvailable", Boolean.valueOf(delta != null));
        } else {
            out.put("statsAvailable", Boolean.FALSE);
        }
        return out;
    }

    private static Double ms(long a, long b) {
        return Double.valueOf(Math.round((b - a) / 1e3) / 1e3);
    }

    /** ResultSet 을 읽어 행/컬럼/지문을 만든다. */
    private static Map<String, Object> fetch(ResultSet rs, int maxRows, boolean keepRows, int keepRowsMax,
                                               boolean hashResult)
            throws SQLException {
        Map<String, Object> out = Json.obj();
        ResultSetMetaData md = rs.getMetaData();
        int n = md.getColumnCount();
        List<Object> cols = Json.arr();
        int[] types = new int[n + 1];
        StringBuilder colSig = new StringBuilder();
        for (int i = 1; i <= n; i++) {
            types[i] = md.getColumnType(i);
            Map<String, Object> c = Json.obj();
            c.put("name", md.getColumnLabel(i));
            c.put("field", "c" + i);
            c.put("typeName", md.getColumnTypeName(i));
            c.put("sqlType", Integer.valueOf(types[i]));
            c.put("precision", Integer.valueOf(safePrecision(md, i)));
            c.put("scale", Integer.valueOf(safeScale(md, i)));
            c.put("nullable", Integer.valueOf(safeNullable(md, i)));
            c.put("numeric", Boolean.valueOf(isNumeric(types[i])));
            try { c.put("table", md.getTableName(i)); } catch (Throwable ignore) { }
            cols.add(c);
            colSig.append(md.getColumnLabel(i)).append(':').append(md.getColumnTypeName(i)).append('|');
        }
        out.put("columns", cols);

        List<Object> rows = Json.arr();
        MessageDigest ordered = hashResult ? digest() : null;
        List<String> rowDigests = hashResult ? new ArrayList<String>() : null;

        int count = 0;
        boolean truncated = false;
        while (rs.next()) {
            if (count >= maxRows) { truncated = true; break; }
            Object[] vals = new Object[n];
            StringBuilder canon = hashResult ? new StringBuilder(128) : null;
            for (int i = 1; i <= n; i++) {
                Object v = Sql.value(rs, i, types[i]);
                vals[i - 1] = v;
                if (canon != null) { canon.append(canon(v)).append(UNIT_SEP); }
            }
            boolean withinKeepCap = count < keepRowsMax;
            if (hashResult) {
                byte[] rowBytes = utf8(canon.toString());
                ordered.update(rowBytes);
                ordered.update((byte) 0x1E);
                // rowDigests 는 unordered 해시의 재료다. keepRowsMax 를 넘으면 일부만 모이므로
                // 그 상태로 unordered 해시를 계산하면 "결과가 같다"는 판정이 조용히 틀릴 수 있다.
                // 아래에서 truncated 시 unordered 해시 자체를 내보내지 않는다.
                if (withinKeepCap) rowDigests.add(hex(sha256(rowBytes)));
            }
            // rows 도 동일한 상한으로 묶는다 — 200만 행을 그대로 보관하면 힙(-Xmx768m)이 터진다.
            if (keepRows && withinKeepCap) rows.add(Arrays.asList(vals));
            count++;
        }
        boolean keepTruncated = count > keepRowsMax;
        out.put("rows", rows);
        out.put("rowCount", Integer.valueOf(count));
        out.put("truncated", Boolean.valueOf(truncated));
        out.put("keptRows", Boolean.valueOf(keepRows));
        // 소비(얼마나 읽었는가)와 보관(응답에 얼마나 담았는가)을 명시적으로 분리해 알린다.
        out.put("consumedRows", Integer.valueOf(count));
        out.put("keptRowCount", Integer.valueOf(rows.size()));
        out.put("keepTruncated", Boolean.valueOf(keepTruncated));

        if (hashResult) {
            Map<String, Object> h = Json.obj();
            h.put("ordered", hex(ordered.digest()));
            if (keepTruncated) {
                // rowDigests 가 keepRowsMax 에서 잘렸다 — 부분 집합으로 계산한 unordered 해시를
                // 정상값처럼 반환하지 않는다. 이걸 어기면 튜닝 전후 비교가 조용히 틀린다.
                h.put("unorderedAvailable", Boolean.FALSE);
                h.put("unorderedSkippedReason", "keepRowsMax 초과");
            } else {
                Collections.sort(rowDigests);
                MessageDigest un = digest();
                for (String d : rowDigests) un.update(utf8(d));
                h.put("unordered", hex(un.digest()));
                h.put("unorderedAvailable", Boolean.TRUE);
            }
            h.put("rowCount", Integer.valueOf(count));
            h.put("columnSignature", Sql.hex(sha256(utf8(colSig.toString()))).substring(0, 16));
            h.put("truncated", Boolean.valueOf(truncated));
            out.put("hash", h);
            if (!keepTruncated) {
                // 차집합 계산을 위해 행 지문 목록을 남긴다(비교 명령에서만 사용).
                // keepRowsMax 초과 시에는 부분 목록을 넘기지 않는다(Node 쪽 폭발 방지 + 오판정 방지).
                out.put("_rowDigests", rowDigests);
            }
        }
        return out;
    }

    private static int safePrecision(ResultSetMetaData md, int i) {
        try { return md.getPrecision(i); } catch (Throwable t) { return 0; }
    }

    private static int safeScale(ResultSetMetaData md, int i) {
        try { return md.getScale(i); } catch (Throwable t) { return 0; }
    }

    private static int safeNullable(ResultSetMetaData md, int i) {
        try { return md.isNullable(i); } catch (Throwable t) { return ResultSetMetaData.columnNullableUnknown; }
    }

    static boolean isNumeric(int t) {
        return t == java.sql.Types.NUMERIC || t == java.sql.Types.DECIMAL || t == java.sql.Types.INTEGER
            || t == java.sql.Types.BIGINT || t == java.sql.Types.SMALLINT || t == java.sql.Types.TINYINT
            || t == java.sql.Types.FLOAT || t == java.sql.Types.REAL || t == java.sql.Types.DOUBLE;
    }

    /** 지문 계산용 값 정규화. 숫자 표기 흔들림(1 vs 1.0)을 없앤다. */
    static String canon(Object v) {
        if (v == null) return NULL_MARK;
        if (v instanceof Number) {
            try {
                return new BigDecimal(v.toString()).stripTrailingZeros().toPlainString();
            } catch (NumberFormatException e) {
                return v.toString();
            }
        }
        if (v instanceof Boolean) return ((Boolean) v).booleanValue() ? "1" : "0";
        return v.toString();
    }

    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (Exception e) { throw new IllegalStateException("SHA-256 미지원", e); }
    }

    private static byte[] sha256(byte[] b) { return digest().digest(b); }

    private static byte[] utf8(String s) {
        try { return s.getBytes("UTF-8"); } catch (Exception e) { return s.getBytes(); }
    }

    private static String hex(byte[] b) { return Sql.hex(b).toLowerCase(); }

    @SuppressWarnings("unchecked")
    static Object[] bindArray(Object o) {
        if (o == null) return null;
        if (o instanceof List) {
            List<Object> l = (List<Object>) o;
            return l.toArray(new Object[0]);
        }
        return null;
    }

    /**
     * 첫 DML 키워드 뒤에 힌트를 주입한다. 기존 힌트가 있으면 그 안에 합친다.
     * 주석/문자열을 건드리지 않도록 앞부분만 최소한으로 손댄다.
     */
    static String injectHint(String sql, String hint) {
        String upper = sql.toUpperCase();
        String[] kws = { "SELECT", "INSERT", "UPDATE", "DELETE", "MERGE" };
        int pos = -1, len = 0;
        for (String k : kws) {
            int i = indexOfWord(upper, k);
            if (i >= 0 && (pos < 0 || i < pos)) { pos = i; len = k.length(); }
        }
        if (pos < 0) return sql;
        int after = pos + len;
        String rest = sql.substring(after);
        String restTrimmed = rest.replaceFirst("^\\s+", "");
        int wsLen = rest.length() - restTrimmed.length();
        if (restTrimmed.startsWith("/*+")) {
            int close = restTrimmed.indexOf("*/");
            if (close > 0) {
                String inner = restTrimmed.substring(3, close);
                if (inner.toUpperCase().contains(hint.toUpperCase())) return sql;
                return sql.substring(0, after) + rest.substring(0, wsLen) + "/*+ " + hint + " " + inner.trim() + " */"
                    + restTrimmed.substring(close + 2);
            }
        }
        return sql.substring(0, after) + " /*+ " + hint + " */" + rest;
    }

    /** 단어 경계를 지켜 키워드 위치를 찾는다(문자열/주석 안은 무시하지 못하므로 앞부분 한정 사용). */
    private static int indexOfWord(String s, String word) {
        int from = 0;
        while (true) {
            int i = s.indexOf(word, from);
            if (i < 0) return -1;
            boolean leftOk = (i == 0) || !Character.isLetterOrDigit(s.charAt(i - 1)) && s.charAt(i - 1) != '_';
            int e = i + word.length();
            boolean rightOk = (e >= s.length()) || !Character.isLetterOrDigit(s.charAt(e)) && s.charAt(e) != '_';
            if (leftOk && rightOk) return i;
            from = i + 1;
        }
    }

    // ── 반복 측정(벤치마크) ───────────────────────────────────────────────────

    /**
     * 같은 SQL 을 여러 번 실행해 대표값을 구한다.
     * 워밍업 실행은 통계에서 제외한다(첫 실행은 하드파싱·캐시 미적재로 항상 느리다).
     */
    public static Map<String, Object> benchmark(Db.Session s, Map<String, Object> params) throws SQLException {
        int runs = Math.max(1, Math.min(50, Json.intv(params, "runs", 3)));
        int warmup = Math.max(0, Math.min(10, Json.intv(params, "warmup", 1)));

        Map<String, Object> single = new LinkedHashMap<String, Object>(params);
        single.put("keepRows", Boolean.FALSE);
        // 반복 측정도 끝까지 인출해야 실제 비용이 잡힌다(잘라 읽으면 차이가 사라진다)
        single.put("fullFetch", Boolean.TRUE);
        // 지문 계산은 순수한 시간 측정을 방해하므로 끈다(동일성 검증은 compare 가 따로 한다)
        single.put("hashResult", Boolean.FALSE);

        List<Object> runsOut = Json.arr();
        Map<String, Object> firstHash = null;
        Integer rowCount = null;

        for (int i = 0; i < warmup + runs; i++) {
            Map<String, Object> r = execute(s, single);
            if (i == 0) {
                Object h = r.get("hash");
                if (h instanceof Map) firstHash = Json.asMap(h);
                Object rc = r.get("rowCount");
                if (rc instanceof Number) rowCount = Integer.valueOf(((Number) rc).intValue());
            }
            if (i < warmup) continue;
            Map<String, Object> item = Json.obj();
            item.put("run", Integer.valueOf(i - warmup + 1));
            item.put("timings", r.get("timings"));
            item.put("stats", r.get("stats"));
            item.put("rowCount", r.get("rowCount"));
            runsOut.add(item);
        }

        Map<String, Object> out = Json.obj();
        out.put("runs", runsOut);
        out.put("warmup", Integer.valueOf(warmup));
        out.put("hash", firstHash);
        out.put("rowCount", rowCount);
        out.put("aggregate", aggregate(runsOut));
        return out;
    }

    /** 실행 목록에서 대표값(최소/중앙/평균/최대)과 통계 중앙값을 뽑는다. */
    static Map<String, Object> aggregate(List<Object> runs) {
        Map<String, Object> agg = Json.obj();
        List<Double> totals = new ArrayList<Double>();
        List<Double> execs = new ArrayList<Double>();
        Map<String, List<Double>> statLists = new LinkedHashMap<String, List<Double>>();
        for (Object o : runs) {
            Map<String, Object> r = Json.asMap(o);
            Map<String, Object> t = Json.asMap(r.get("timings"));
            if (t.get("totalMs") instanceof Number) totals.add(Double.valueOf(((Number) t.get("totalMs")).doubleValue()));
            if (t.get("executeMs") instanceof Number) execs.add(Double.valueOf(((Number) t.get("executeMs")).doubleValue()));
            Object st = r.get("stats");
            if (st instanceof Map) {
                for (Map.Entry<String, Object> e : Json.asMap(st).entrySet()) {
                    List<Double> l = statLists.get(e.getKey());
                    if (l == null) { l = new ArrayList<Double>(); statLists.put(e.getKey(), l); }
                    l.add(Double.valueOf(toDouble(e.getValue())));
                }
            }
        }
        agg.put("totalMs", stat(totals));
        agg.put("executeMs", stat(execs));
        Map<String, Object> sm = Json.obj();
        for (Map.Entry<String, List<Double>> e : statLists.entrySet()) {
            sm.put(e.getKey(), median(e.getValue()));
        }
        agg.put("statsMedian", sm);
        agg.put("samples", Integer.valueOf(totals.size()));
        return agg;
    }

    private static Map<String, Object> stat(List<Double> vals) {
        Map<String, Object> m = Json.obj();
        if (vals.isEmpty()) return m;
        List<Double> v = new ArrayList<Double>(vals);
        Collections.sort(v);
        double sum = 0;
        for (Double d : v) sum += d.doubleValue();
        m.put("min", v.get(0));
        m.put("max", v.get(v.size() - 1));
        m.put("avg", Double.valueOf(round3(sum / v.size())));
        m.put("median", median(v));
        return m;
    }

    private static Double median(List<Double> vals) {
        if (vals == null || vals.isEmpty()) return null;
        List<Double> v = new ArrayList<Double>(vals);
        Collections.sort(v);
        int n = v.size();
        double m = (n % 2 == 1) ? v.get(n / 2).doubleValue()
            : (v.get(n / 2 - 1).doubleValue() + v.get(n / 2).doubleValue()) / 2.0;
        return Double.valueOf(round3(m));
    }

    private static double round3(double d) { return Math.round(d * 1000.0) / 1000.0; }

    // ── 전후 비교 검증 ────────────────────────────────────────────────────────

    /**
     * 튜닝 전/후 SQL 을 <b>번갈아</b> 실행해 성능과 결과 동일성을 함께 검증한다.
     *
     * <p>번갈아 실행하는 이유: 순차로 A 를 n번, B 를 n번 돌리면 캐시 적재/부하 변동이
     * 뒤쪽에 유리하게 작용한다. A,B,A,B 로 교차하면 그 편향이 상쇄된다.
     */
    public static Map<String, Object> compare(Db.Session s, Map<String, Object> params) throws SQLException {
        Map<String, Object> beforeP = Json.asMap(params.get("before"));
        Map<String, Object> afterP = Json.asMap(params.get("after"));
        int runs = Math.max(1, Math.min(20, Json.intv(params, "runs", 3)));
        int warmup = Math.max(0, Math.min(5, Json.intv(params, "warmup", 1)));
        int maxRows = Json.intv(params, "maxRows", 5000);
        int timeoutSec = Json.intv(params, "timeoutSec", 120);
        boolean verifyResults = Json.bool(params, "verifyResults", true);

        Map<String, Object> out = Json.obj();

        // 1) 결과 동일성 — 각각 1회 실행하며 행 지문을 모은다
        Map<String, Object> verify = Json.obj();
        if (verifyResults) {
            Map<String, Object> a = execOnce(s, beforeP, maxRows, timeoutSec, true);
            Map<String, Object> b = execOnce(s, afterP, maxRows, timeoutSec, true);
            verify = verifyEquivalence(a, b);
            out.put("beforeSample", sample(a));
            out.put("afterSample", sample(b));
        } else {
            verify.put("checked", Boolean.FALSE);
            verify.put("verdict", "SKIPPED");
        }
        out.put("verification", verify);

        // 2) 성능 — 교차 실행
        List<Object> beforeRuns = Json.arr();
        List<Object> afterRuns = Json.arr();
        for (int i = 0; i < warmup; i++) {
            execOnce(s, beforeP, maxRows, timeoutSec, false);
            execOnce(s, afterP, maxRows, timeoutSec, false);
        }
        for (int i = 0; i < runs; i++) {
            Map<String, Object> ra = execOnce(s, beforeP, maxRows, timeoutSec, false);
            Map<String, Object> rb = execOnce(s, afterP, maxRows, timeoutSec, false);
            beforeRuns.add(runItem(i + 1, ra));
            afterRuns.add(runItem(i + 1, rb));
        }
        Map<String, Object> beforeAgg = aggregate(beforeRuns);
        Map<String, Object> afterAgg = aggregate(afterRuns);

        Map<String, Object> perf = Json.obj();
        perf.put("beforeRuns", beforeRuns);
        perf.put("afterRuns", afterRuns);
        perf.put("before", beforeAgg);
        perf.put("after", afterAgg);
        perf.put("delta", deltaReport(beforeAgg, afterAgg));
        out.put("performance", perf);
        out.put("runs", Integer.valueOf(runs));
        out.put("warmup", Integer.valueOf(warmup));
        return out;
    }

    private static Map<String, Object> runItem(int idx, Map<String, Object> r) {
        Map<String, Object> item = Json.obj();
        item.put("run", Integer.valueOf(idx));
        item.put("timings", r.get("timings"));
        item.put("stats", r.get("stats"));
        item.put("rowCount", r.get("rowCount"));
        return item;
    }

    /**
     * 측정용 1회 실행.
     *
     * @param keep true 면 <b>검증용</b> 실행 — 행을 보관하고 지문을 만든다(maxRows 로 제한).
     *             false 면 <b>계측용</b> 실행 — 행을 버리되 <b>끝까지 인출</b>한다(fullFetch).
     *             계측에서 행을 잘라 읽으면 전체 스캔의 비용이 중간에 끊겨
     *             튜닝 전/후가 똑같이 빨라 보이는 착시가 생긴다.
     */
    private static Map<String, Object> execOnce(Db.Session s, Map<String, Object> p, int maxRows,
                                                int timeoutSec, boolean keep) throws SQLException {
        Map<String, Object> q = Json.obj();
        q.put("sql", Json.str(p, "sql", ""));
        q.put("binds", p.get("binds"));
        q.put("maxRows", Integer.valueOf(maxRows));
        q.put("timeoutSec", Integer.valueOf(timeoutSec));
        q.put("collectStats", Boolean.TRUE);
        q.put("hashResult", Boolean.valueOf(keep));
        q.put("keepRows", Boolean.valueOf(keep));
        q.put("fullFetch", Boolean.valueOf(!keep));   // 계측 실행은 끝까지 읽는다
        q.put("safeMode", Boolean.TRUE);
        return execute(s, q);
    }

    private static Map<String, Object> sample(Map<String, Object> r) {
        Map<String, Object> m = Json.obj();
        m.put("columns", r.get("columns"));
        List<Object> rows = Json.asList(r.get("rows"));
        m.put("rows", rows.size() > 50 ? rows.subList(0, 50) : rows);
        m.put("rowCount", r.get("rowCount"));
        m.put("truncated", r.get("truncated"));
        m.put("timings", r.get("timings"));
        m.put("stats", r.get("stats"));
        m.put("hash", r.get("hash"));
        return m;
    }

    /**
     * 결과 동일성 판정.
     * <pre>
     *   IDENTICAL          컬럼·행수·순서까지 완전 동일
     *   SAME_SET           행 집합(중복 포함)은 같으나 순서가 다름 → ORDER BY 차이
     *   DIFFERENT          행 내용이 다름 (차집합 표본 제공)
     *   INCONCLUSIVE       한쪽이 잘렸거나 DML 이라 판정 불가
     * </pre>
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> verifyEquivalence(Map<String, Object> a, Map<String, Object> b) {
        Map<String, Object> v = Json.obj();
        v.put("checked", Boolean.TRUE);

        boolean aQuery = "query".equals(a.get("kind"));
        boolean bQuery = "query".equals(b.get("kind"));
        if (!aQuery || !bQuery) {
            v.put("verdict", "INCONCLUSIVE");
            v.put("reason", "조회(SELECT)가 아니어서 결과 비교를 할 수 없습니다. 영향 행수만 비교하세요.");
            v.put("beforeAffected", a.get("affectedRows"));
            v.put("afterAffected", b.get("affectedRows"));
            return v;
        }

        Map<String, Object> ha = Json.asMap(a.get("hash"));
        Map<String, Object> hb = Json.asMap(b.get("hash"));
        v.put("beforeHash", ha);
        v.put("afterHash", hb);

        List<Object> ca = Json.asList(a.get("columns"));
        List<Object> cb = Json.asList(b.get("columns"));
        List<Object> colDiff = Json.arr();
        if (ca.size() != cb.size()) {
            Map<String, Object> d = Json.obj();
            d.put("issue", "COLUMN_COUNT");
            d.put("before", Integer.valueOf(ca.size()));
            d.put("after", Integer.valueOf(cb.size()));
            colDiff.add(d);
        } else {
            for (int i = 0; i < ca.size(); i++) {
                String na = Json.str(Json.asMap(ca.get(i)), "name", "");
                String nb = Json.str(Json.asMap(cb.get(i)), "name", "");
                if (!na.equalsIgnoreCase(nb)) {
                    Map<String, Object> d = Json.obj();
                    d.put("issue", "COLUMN_NAME");
                    d.put("index", Integer.valueOf(i + 1));
                    d.put("before", na);
                    d.put("after", nb);
                    colDiff.add(d);
                }
            }
        }
        v.put("columnDiff", colDiff);

        boolean truncated = Boolean.TRUE.equals(a.get("truncated")) || Boolean.TRUE.equals(b.get("truncated"));
        v.put("truncated", Boolean.valueOf(truncated));

        int rcA = intOf(a.get("rowCount")), rcB = intOf(b.get("rowCount"));
        v.put("beforeRowCount", Integer.valueOf(rcA));
        v.put("afterRowCount", Integer.valueOf(rcB));

        String ordA = Json.str(ha, "ordered", "");
        String ordB = Json.str(hb, "ordered", "");
        String unA = Json.str(ha, "unordered", "");
        String unB = Json.str(hb, "unordered", "");

        String verdict;
        if (!ordA.isEmpty() && ordA.equals(ordB)) verdict = "IDENTICAL";
        else if (!unA.isEmpty() && unA.equals(unB)) verdict = "SAME_SET";
        else verdict = "DIFFERENT";

        if (truncated && !"IDENTICAL".equals(verdict)) {
            v.put("note", "결과가 maxRows 에서 잘렸습니다. 잘린 상태의 비교이므로 전체 동일성은 보장하지 않습니다.");
        }
        v.put("verdict", verdict);
        v.put("verdictLabel",
            "IDENTICAL".equals(verdict) ? "완전 동일 (행 내용 + 순서)"
            : "SAME_SET".equals(verdict) ? "행 집합 동일 / 순서 다름 (ORDER BY 차이)"
            : "결과가 다릅니다");

        if ("DIFFERENT".equals(verdict)) {
            List<String> da = (List<String>) (List<?>) Json.asList(a.get("_rowDigests"));
            List<String> db = (List<String>) (List<?>) Json.asList(b.get("_rowDigests"));
            v.put("diff", digestDiff(da, db, Json.asList(a.get("rows")), Json.asList(b.get("rows"))));
        }
        return v;
    }

    /** 행 지문 다중집합 차이를 구하고, 차이나는 행의 표본을 붙인다. */
    private static Map<String, Object> digestDiff(List<String> da, List<String> db,
                                                  List<Object> rowsA, List<Object> rowsB) {
        Map<String, Object> d = Json.obj();
        Map<String, Integer> ca = counter(da), cb = counter(db);
        int onlyA = 0, onlyB = 0;
        Map<String, Integer> extraA = new HashMap<String, Integer>(), extraB = new HashMap<String, Integer>();
        for (Map.Entry<String, Integer> e : ca.entrySet()) {
            int other = cb.containsKey(e.getKey()) ? cb.get(e.getKey()).intValue() : 0;
            int diff = e.getValue().intValue() - other;
            if (diff > 0) { onlyA += diff; extraA.put(e.getKey(), Integer.valueOf(diff)); }
        }
        for (Map.Entry<String, Integer> e : cb.entrySet()) {
            int other = ca.containsKey(e.getKey()) ? ca.get(e.getKey()).intValue() : 0;
            int diff = e.getValue().intValue() - other;
            if (diff > 0) { onlyB += diff; extraB.put(e.getKey(), Integer.valueOf(diff)); }
        }
        d.put("onlyInBefore", Integer.valueOf(onlyA));
        d.put("onlyInAfter", Integer.valueOf(onlyB));
        d.put("beforeSampleRows", pickSamples(da, extraA, rowsA, 20));
        d.put("afterSampleRows", pickSamples(db, extraB, rowsB, 20));
        return d;
    }

    private static Map<String, Integer> counter(List<String> l) {
        Map<String, Integer> m = new HashMap<String, Integer>();
        if (l == null) return m;
        for (String s : l) {
            Integer c = m.get(s);
            m.put(s, Integer.valueOf(c == null ? 1 : c.intValue() + 1));
        }
        return m;
    }

    private static List<Object> pickSamples(List<String> digests, Map<String, Integer> wanted,
                                            List<Object> rows, int limit) {
        List<Object> out = Json.arr();
        if (digests == null || rows == null) return out;
        Map<String, Integer> remain = new HashMap<String, Integer>(wanted);
        for (int i = 0; i < digests.size() && out.size() < limit && i < rows.size(); i++) {
            String dg = digests.get(i);
            Integer r = remain.get(dg);
            if (r == null || r.intValue() <= 0) continue;
            remain.put(dg, Integer.valueOf(r.intValue() - 1));
            out.add(rows.get(i));
        }
        return out;
    }

    private static int intOf(Object o) {
        return (o instanceof Number) ? ((Number) o).intValue() : 0;
    }

    /** 전후 대표값 차이를 % 로 정리한다. */
    static Map<String, Object> deltaReport(Map<String, Object> before, Map<String, Object> after) {
        Map<String, Object> d = Json.obj();
        Double b = medianOf(before, "totalMs"), a = medianOf(after, "totalMs");
        if (b != null && a != null) {
            d.put("beforeMedianMs", b);
            d.put("afterMedianMs", a);
            d.put("deltaMs", Double.valueOf(round3(a.doubleValue() - b.doubleValue())));
            if (b.doubleValue() > 0) {
                double pct = (b.doubleValue() - a.doubleValue()) / b.doubleValue() * 100.0;
                d.put("improvementPct", Double.valueOf(Math.round(pct * 10) / 10.0));
                d.put("speedup", Double.valueOf(a.doubleValue() > 0
                    ? Math.round(b.doubleValue() / a.doubleValue() * 100) / 100.0 : 0));
            }
        }
        Map<String, Object> sb = Json.asMap(before.get("statsMedian"));
        Map<String, Object> sa = Json.asMap(after.get("statsMedian"));
        List<Object> statDelta = Json.arr();
        for (String k : STAT_NAMES) {
            Object vb = sb.get(k), va = sa.get(k);
            if (vb == null && va == null) continue;
            double dvb = toDouble(vb == null ? Integer.valueOf(0) : vb);
            double dva = toDouble(va == null ? Integer.valueOf(0) : va);
            if (dvb == 0 && dva == 0) continue;
            Map<String, Object> row = Json.obj();
            row.put("name", k);
            row.put("before", Double.valueOf(dvb));
            row.put("after", Double.valueOf(dva));
            row.put("delta", Double.valueOf(dva - dvb));
            row.put("improvementPct", Double.valueOf(dvb > 0
                ? Math.round((dvb - dva) / dvb * 1000) / 10.0 : 0));
            statDelta.add(row);
        }
        d.put("stats", statDelta);
        d.put("statsAvailable", Boolean.valueOf(!statDelta.isEmpty()));
        return d;
    }

    private static Double medianOf(Map<String, Object> agg, String key) {
        Map<String, Object> m = Json.asMap(agg.get(key));
        Object v = m.get("median");
        return (v instanceof Number) ? Double.valueOf(((Number) v).doubleValue()) : null;
    }

    // ── 다중 후보 토너먼트 ────────────────────────────────────────────────────

    /** 기준(baseline)을 가리키는 예약 ID. 후보 ID 와 겹치지 않게 밑줄 두 개를 쓴다. */
    public static final String BASELINE_ID = "__baseline";

    /**
     * 원본 SQL 과 여러 튜닝 후보를 <b>라운드로빈</b>으로 돌려 성능·부하를 한꺼번에 잰다.
     *
     * <p><b>왜 라운드로빈인가</b> — 후보를 하나씩 n번 몰아서 실행하면 뒤에 실행된 후보일수록
     * 버퍼 캐시가 데워져 유리해진다. 매 회차마다 순서를 <b>회전</b>시키면 그 자리 편향이
     * 후보 전체에 고르게 분산되어 상쇄된다. 측정 결과를 믿을 수 있게 만드는 핵심 장치다.
     *
     * <p>진행 순서
     * <ol>
     *   <li>기준 1회 실행 — 결과 지문(정답지)을 만든다</li>
     *   <li>후보를 각 1회 실행 — 문법 오류/권한 오류로 못 도는 후보를 먼저 걸러내고,
     *       기준과 결과가 같은지 판정한다</li>
     *   <li>살아남은 후보 + 기준을 회전 순서로 runs 회전 실행하며 시간·세션통계를 모은다</li>
     * </ol>
     *
     * <p>결과가 다른 후보도 <b>버리지 않고</b> 판정 결과와 함께 돌려준다.
     * "빠르지만 결과가 다르다"는 사실 자체가 사용자가 알아야 할 정보이기 때문이다.
     */
    public static Map<String, Object> tournament(Db.Session s, Map<String, Object> params, String reqId) throws SQLException {
        Map<String, Object> baseP = Json.asMap(params.get("baseline"));
        List<Object> cands = Json.asList(params.get("candidates"));
        int runs = Math.max(1, Math.min(20, Json.intv(params, "runs", 3)));
        int warmup = Math.max(0, Math.min(5, Json.intv(params, "warmup", 1)));
        int maxRows = Json.intv(params, "maxRows", 5000);
        int timeoutSec = Json.intv(params, "timeoutSec", 60);
        boolean verify = Json.bool(params, "verifyResults", true);

        Map<String, Object> out = Json.obj();
        List<Object> notes = Json.arr();

        // ── 1) 기준 실행 (정답지 확보) ──────────────────────────────────────
        Map<String, Object> baseRef;
        try {
            baseRef = execOnce(s, baseP, maxRows, timeoutSec, verify);
        } catch (SQLException e) {
            out.put("ok", Boolean.FALSE);
            out.put("error", "원본 SQL 실행에 실패했습니다: " + e.getMessage());
            out.put("ora", Db.oraCode(e.getMessage()));
            return out;
        }

        // ── 2) 후보별 1회 실행 — 유효성 + 결과 동일성 ───────────────────────
        Map<String, Map<String, Object>> byId = new LinkedHashMap<String, Map<String, Object>>();
        List<Map<String, Object>> alive = new ArrayList<Map<String, Object>>();

        int verifyTotal = cands.size();
        int verifyDone = 0;
        for (Object o : cands) {
            Map<String, Object> c = Json.asMap(o);
            String id = Json.str(c, "id", "");
            Map<String, Object> r = Json.obj();
            r.put("id", id);
            r.put("sql", Json.str(c, "sql", ""));
            try {
                Map<String, Object> ref = execOnce(s, c, maxRows, timeoutSec, verify);
                r.put("ok", Boolean.TRUE);
                r.put("rowCount", ref.get("rowCount"));
                r.put("truncated", ref.get("truncated"));
                if (verify) r.put("verification", verifyEquivalence(baseRef, ref));
                alive.add(c);
            } catch (Throwable t) {
                // 후보 생성 규칙이 만든 SQL 이 항상 유효하다는 보장은 없다.
                // 여기서 조용히 탈락시키되 사유는 그대로 남겨 사용자가 알 수 있게 한다.
                r.put("ok", Boolean.FALSE);
                String msg = t.getMessage() == null ? t.toString() : t.getMessage();
                r.put("error", msg.replace('\n', ' ').trim());
                r.put("ora", Db.oraCode(msg));
            }
            byId.put(id, r);
            verifyDone++;
            Map<String, Object> pe = Json.obj();
            pe.put("phase", "verify");
            pe.put("done", Integer.valueOf(verifyDone));
            pe.put("total", Integer.valueOf(verifyTotal));
            pe.put("label", id);
            Bridge.event(reqId, "progress", pe);
        }

        // ── 3) 라운드로빈 측정 ──────────────────────────────────────────────
        List<Map<String, Object>> lineup = new ArrayList<Map<String, Object>>();
        Map<String, Object> baseEntry = Json.obj();
        baseEntry.put("id", BASELINE_ID);
        baseEntry.put("sql", Json.str(baseP, "sql", ""));
        baseEntry.put("binds", baseP.get("binds"));
        lineup.add(baseEntry);
        lineup.addAll(alive);

        Map<String, List<Object>> runsById = new LinkedHashMap<String, List<Object>>();
        for (Map<String, Object> e : lineup) runsById.put(Json.str(e, "id", ""), Json.arr());

        // 워밍업 — 하드파싱과 첫 물리읽기를 측정에서 제외한다
        for (int w = 0; w < warmup; w++) {
            for (Map<String, Object> e : lineup) {
                try { execOnce(s, e, maxRows, timeoutSec, false); } catch (Throwable ignore) { }
            }
        }

        int measureTotal = runs * lineup.size();
        int measureDone = 0;
        for (int r = 0; r < runs; r++) {
            for (int k = 0; k < lineup.size(); k++) {
                Map<String, Object> e = lineup.get((k + r) % lineup.size()); // ← 회차마다 순서 회전
                String id = Json.str(e, "id", "");
                try {
                    Map<String, Object> res = execOnce(s, e, maxRows, timeoutSec, false);
                    Map<String, Object> item = runItem(r + 1, res);
                    item.put("slot", Integer.valueOf(k + 1)); // 이번 회차에서 몇 번째로 돌았는지
                    runsById.get(id).add(item);
                } catch (Throwable t) {
                    Map<String, Object> item = Json.obj();
                    item.put("run", Integer.valueOf(r + 1));
                    item.put("error", String.valueOf(t.getMessage()));
                    runsById.get(id).add(item);
                }
                measureDone++;
                Map<String, Object> pe = Json.obj();
                pe.put("phase", "measure");
                pe.put("done", Integer.valueOf(measureDone));
                pe.put("total", Integer.valueOf(measureTotal));
                pe.put("label", id);
                Bridge.event(reqId, "progress", pe);
            }
        }

        // ── 4) 집계 ────────────────────────────────────────────────────────
        Map<String, Object> baseAgg = aggregate(runsById.get(BASELINE_ID));
        Map<String, Object> baseline = Json.obj();
        baseline.put("id", BASELINE_ID);
        baseline.put("sql", Json.str(baseP, "sql", ""));
        baseline.put("rowCount", baseRef.get("rowCount"));
        baseline.put("truncated", baseRef.get("truncated"));
        baseline.put("hash", baseRef.get("hash"));
        baseline.put("aggregate", baseAgg);
        baseline.put("runs", runsById.get(BASELINE_ID));
        baseline.put("columns", baseRef.get("columns"));
        out.put("baseline", baseline);

        List<Object> results = Json.arr();
        for (Map<String, Object> c : alive) {
            String id = Json.str(c, "id", "");
            Map<String, Object> r = byId.get(id);
            Map<String, Object> agg = aggregate(runsById.get(id));
            r.put("aggregate", agg);
            r.put("runs", runsById.get(id));
            r.put("delta", deltaReport(baseAgg, agg));
        }
        for (Map.Entry<String, Map<String, Object>> e : byId.entrySet()) results.add(e.getValue());
        out.put("candidates", results);

        out.put("ok", Boolean.TRUE);
        out.put("runs", Integer.valueOf(runs));
        out.put("warmup", Integer.valueOf(warmup));
        out.put("executions", Integer.valueOf(lineup.size() * (runs + warmup) + 1 + cands.size()));
        out.put("aliveCount", Integer.valueOf(alive.size()));
        out.put("totalCount", Integer.valueOf(cands.size()));
        out.put("notes", notes);
        return out;
    }
}
