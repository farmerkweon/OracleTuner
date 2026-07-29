package kr.foxnail.otuner;

import java.io.Reader;
import java.math.BigDecimal;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JDBC 저수준 헬퍼 — 값 변환, 짧은 조회, 권한 탐침용 안전 실행.
 *
 * <p>값 변환 규칙(모든 조회가 공유):
 * <ul>
 *   <li>NUMBER: 유효자릿수 15 이하면 JSON 숫자, 넘으면 정밀도 보존을 위해 문자열</li>
 *   <li>DATE/TIMESTAMP: {@code yyyy-MM-dd HH:mm:ss[.SSS]} 문자열(로케일 무관)</li>
 *   <li>CLOB/BLOB/RAW: 앞부분만 잘라서 문자열/HEX, 잘렸으면 말미에 표시</li>
 *   <li>그 외: {@code getString}</li>
 * </ul>
 * 이 규칙 덕분에 결과 해시(튜닝 전후 동일성 검증)가 타입별 표기 흔들림 없이 안정적으로 계산된다.
 */
public final class Sql {

    private Sql() {}

    /** LOB/RAW 를 읽어들일 최대 문자 수. */
    public static final int LOB_LIMIT = 4000;

    // ── 값 변환 ──────────────────────────────────────────────────────────────

    public static Object value(ResultSet rs, int col, int sqlType) throws SQLException {
        switch (sqlType) {
            case Types.NUMERIC:
            case Types.DECIMAL:
            case Types.BIGINT:
            case Types.INTEGER:
            case Types.SMALLINT:
            case Types.TINYINT: {
                BigDecimal bd = rs.getBigDecimal(col);
                if (bd == null) return null;
                if (bd.precision() <= 15) {
                    if (bd.scale() <= 0) return Long.valueOf(bd.longValue());
                    return Double.valueOf(bd.doubleValue());
                }
                return bd.toPlainString();
            }
            case Types.FLOAT:
            case Types.REAL:
            case Types.DOUBLE: {
                double d = rs.getDouble(col);
                if (rs.wasNull()) return null;
                return Double.valueOf(d);
            }
            case Types.DATE:
            case Types.TIME:
            case Types.TIMESTAMP:
            case Types.TIMESTAMP_WITH_TIMEZONE: {
                try {
                    Timestamp ts = rs.getTimestamp(col);
                    if (ts == null) return null;
                    return fmtTs(ts);
                } catch (SQLException e) {
                    // TIMESTAMP WITH TIME ZONE 등 일부 타입은 getTimestamp 가 실패할 수 있다.
                    return rs.getString(col);
                }
            }
            case Types.CLOB:
            case Types.NCLOB: {
                Clob c = rs.getClob(col);
                if (c == null) return null;
                return readClob(c);
            }
            case Types.BLOB: {
                Blob b = rs.getBlob(col);
                if (b == null) return null;
                long len = b.length();
                int take = (int) Math.min(len, LOB_LIMIT / 2);
                String hex = hex(b.getBytes(1, take));
                return len > take ? (hex + "…(" + len + " bytes)") : hex;
            }
            case Types.BINARY:
            case Types.VARBINARY:
            case Types.LONGVARBINARY: {
                byte[] bs = rs.getBytes(col);
                if (bs == null) return null;
                if (bs.length > LOB_LIMIT / 2) {
                    return hex(java.util.Arrays.copyOf(bs, LOB_LIMIT / 2)) + "…(" + bs.length + " bytes)";
                }
                return hex(bs);
            }
            case Types.BOOLEAN:
            case Types.BIT: {
                boolean v = rs.getBoolean(col);
                return rs.wasNull() ? null : Boolean.valueOf(v);
            }
            default: {
                String s = rs.getString(col);
                if (s == null) return null;
                if (s.length() > LOB_LIMIT) return s.substring(0, LOB_LIMIT) + "…(" + s.length() + " chars)";
                return s;
            }
        }
    }

    private static String readClob(Clob c) throws SQLException {
        Reader r = null;
        try {
            long len = c.length();
            int take = (int) Math.min(len, LOB_LIMIT);
            String s = c.getSubString(1, take);
            return len > take ? (s + "…(" + len + " chars)") : s;
        } catch (SQLException e) {
            return "(CLOB 읽기 실패: " + e.getMessage() + ")";
        } finally {
            if (r != null) try { r.close(); } catch (Exception ignore) { }
        }
    }

    /** 스레드 안전을 위해 매번 새로 만든다(성능보다 안전 우선). */
    public static String fmtTs(Timestamp ts) {
        SimpleDateFormat f = (ts.getNanos() == 0)
            ? new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
            : new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");
        return f.format(ts);
    }

    private static final char[] HEXCH = "0123456789ABCDEF".toCharArray();

    public static String hex(byte[] b) {
        char[] out = new char[b.length * 2];
        for (int i = 0; i < b.length; i++) {
            out[i * 2] = HEXCH[(b[i] >> 4) & 0xF];
            out[i * 2 + 1] = HEXCH[b[i] & 0xF];
        }
        return new String(out);
    }

    // ── 조회 헬퍼 ─────────────────────────────────────────────────────────────

    /** 결과를 {컬럼소문자 → 값} 맵의 리스트로 돌려준다. 딕셔너리 조회용. */
    public static List<Map<String, Object>> query(Connection c, String sql, Object[] binds,
                                                  int maxRows, int timeoutSec) throws SQLException {
        PreparedStatement ps = null;
        ResultSet rs = null;
        try {
            ps = c.prepareStatement(sql);
            bind(ps, binds);
            if (maxRows > 0) ps.setMaxRows(maxRows);
            if (timeoutSec > 0) ps.setQueryTimeout(timeoutSec);
            rs = ps.executeQuery();
            ResultSetMetaData md = rs.getMetaData();
            int n = md.getColumnCount();
            int[] types = new int[n + 1];
            String[] names = new String[n + 1];
            for (int i = 1; i <= n; i++) {
                types[i] = md.getColumnType(i);
                names[i] = md.getColumnLabel(i).toLowerCase();
            }
            List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
            while (rs.next()) {
                Map<String, Object> row = new LinkedHashMap<String, Object>();
                for (int i = 1; i <= n; i++) row.put(names[i], value(rs, i, types[i]));
                out.add(row);
            }
            return out;
        } finally {
            close(rs);
            close(ps);
        }
    }

    public static void bind(PreparedStatement ps, Object[] binds) throws SQLException {
        if (binds == null) return;
        for (int i = 0; i < binds.length; i++) {
            Object v = binds[i];
            if (v == null) ps.setNull(i + 1, Types.VARCHAR);
            else if (v instanceof Integer) ps.setInt(i + 1, (Integer) v);
            else if (v instanceof Long) ps.setLong(i + 1, (Long) v);
            else if (v instanceof Double) ps.setDouble(i + 1, (Double) v);
            else if (v instanceof BigDecimal) ps.setBigDecimal(i + 1, (BigDecimal) v);
            else ps.setString(i + 1, String.valueOf(v));
        }
    }

    /** 단일 스칼라 조회. 결과 없으면 null. */
    public static Object scalar(Connection c, String sql, Object[] binds, int timeoutSec) throws SQLException {
        List<Map<String, Object>> r = query(c, sql, binds, 1, timeoutSec);
        if (r.isEmpty()) return null;
        for (Object v : r.get(0).values()) return v;
        return null;
    }

    /** 예외를 던지지 않는 스칼라 조회. 권한이 없으면 null. */
    public static Object scalarQuiet(Connection c, String sql) {
        try { return scalar(c, sql, null, 5); } catch (Throwable t) { return null; }
    }

    /**
     * "이 SQL 을 돌릴 수 있는가"만 판정한다(권한 탐침).
     * 성공하면 {@code null}, 실패하면 사유 문자열을 돌려준다.
     */
    public static String probe(Connection c, String sql, int timeoutSec) {
        Statement st = null;
        ResultSet rs = null;
        try {
            st = c.createStatement();
            st.setMaxRows(1);
            st.setQueryTimeout(timeoutSec > 0 ? timeoutSec : 5);
            rs = st.executeQuery(sql);
            rs.next();
            return null;
        } catch (Throwable t) {
            String m = t.getMessage();
            String ora = Db.oraCode(m);
            if (m == null) m = t.toString();
            m = m.replace('\n', ' ').trim();
            if (m.length() > 200) m = m.substring(0, 200);
            return ora != null ? (ora + " " + m) : m;
        } finally {
            close(rs);
            close(st);
        }
    }

    /** DDL/DML 을 조용히 실행. 실패 사유를 돌려주고 예외는 던지지 않는다. */
    public static String execQuiet(Connection c, String sql, int timeoutSec) {
        Statement st = null;
        try {
            st = c.createStatement();
            st.setQueryTimeout(timeoutSec > 0 ? timeoutSec : 10);
            st.execute(sql);
            return null;
        } catch (Throwable t) {
            String m = t.getMessage() == null ? t.toString() : t.getMessage();
            return m.replace('\n', ' ').trim();
        } finally {
            close(st);
        }
    }

    public static void close(AutoCloseable c) {
        if (c == null) return;
        try { c.close(); } catch (Exception ignore) { }
    }

    /** 식별자를 안전하게 인용한다(SQL 인젝션 방지 + 대소문자 보존). */
    public static String quoteIdent(String s) {
        if (s == null) return null;
        return "\"" + s.replace("\"", "") + "\"";
    }

    /** 리터럴 문자열을 안전하게 인용한다. */
    public static String quoteLit(String s) {
        if (s == null) return "NULL";
        return "'" + s.replace("'", "''") + "'";
    }
}
