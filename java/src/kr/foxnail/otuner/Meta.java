package kr.foxnail.otuner;

import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 객체 메타데이터 조회 — 딕셔너리 권한에 따라 단계적으로 강등한다.
 *
 * <pre>
 *  1순위  ALL_*  (접근 가능한 모든 객체)
 *  2순위  USER_* (내 소유 객체만)
 *  3순위  JDBC DatabaseMetaData (드라이버가 대신 조회)
 *  4순위  쿼리 서술(describeQuery) — 실행하지 않고 결과 컬럼 구조만
 * </pre>
 *
 * <p>4순위는 <b>딕셔너리 접근이 전면 차단된 계정에서도 항상 동작한다.</b>
 * {@code PreparedStatement.getMetaData()} 는 SQL 을 실행하지 않고 결과 구조만 돌려주므로,
 * "테이블 정보를 볼 수 없는" 보안 환경에서도 컬럼 타입 기반 진단(암시적 형변환 등)이 가능하다.
 */
public final class Meta {

    private Meta() {}

    private static boolean on(Db.Session s, String k) {
        Boolean b = s.caps.get(k);
        return b == null || b.booleanValue(); // 아직 탐침 전이면 일단 시도한다
    }

    private static Map<String, Object> result(String source, List<?> rows, String note) {
        Map<String, Object> m = Json.obj();
        m.put("source", source);
        m.put("rows", rows);
        m.put("count", Integer.valueOf(rows == null ? 0 : rows.size()));
        if (note != null) m.put("note", note);
        return m;
    }

    /** 접근 가능한 스키마(소유자) 목록. */
    public static Map<String, Object> schemas(Db.Session s) {
        if (on(s, "all_tables")) {
            try {
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT owner, COUNT(*) AS table_count FROM all_tables GROUP BY owner ORDER BY owner",
                    null, 2000, 20);
                if (!r.isEmpty()) return result("ALL_TABLES", r, null);
            } catch (SQLException ignore) { }
        }
        List<Map<String, Object>> one = new ArrayList<Map<String, Object>>();
        Map<String, Object> m = Json.obj();
        Object u = Sql.scalarQuiet(s.conn, "SELECT USER FROM dual");
        m.put("owner", u == null ? s.user.toUpperCase() : u);
        m.put("table_count", null);
        one.add(m);
        return result("USER", one, "ALL_TABLES 조회 권한이 없어 접속 계정만 표시합니다.");
    }

    /**
     * 테이블/뷰 목록.
     * @param owner   소유자(비우면 접속 계정)
     * @param pattern 이름 LIKE 패턴(대소문자 무시, 비우면 전체)
     */
    public static Map<String, Object> objects(Db.Session s, String owner, String pattern, int limit) {
        String own = (owner == null || owner.trim().isEmpty()) ? null : owner.trim().toUpperCase();
        String pat = (pattern == null || pattern.trim().isEmpty()) ? "%" : ("%" + pattern.trim().toUpperCase() + "%");
        int lim = limit > 0 ? limit : 500;

        if (on(s, "all_tables") && own != null) {
            try {
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT owner, object_name, object_type, status, " +
                    "       TO_CHAR(last_ddl_time,'YYYY-MM-DD HH24:MI:SS') AS last_ddl_time " +
                    "  FROM all_objects " +
                    " WHERE owner = ? AND UPPER(object_name) LIKE ? " +
                    "   AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','SYNONYM') " +
                    " ORDER BY object_type, object_name",
                    new Object[] { own, pat }, lim, 30);
                if (!r.isEmpty()) return result("ALL_OBJECTS", r, null);
            } catch (SQLException ignore) { }
        }
        if (on(s, "user_tables")) {
            try {
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT USER AS owner, object_name, object_type, status, " +
                    "       TO_CHAR(last_ddl_time,'YYYY-MM-DD HH24:MI:SS') AS last_ddl_time " +
                    "  FROM user_objects " +
                    " WHERE UPPER(object_name) LIKE ? " +
                    "   AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','SYNONYM') " +
                    " ORDER BY object_type, object_name",
                    new Object[] { pat }, lim, 30);
                if (!r.isEmpty()) return result("USER_OBJECTS", r, null);
            } catch (SQLException ignore) { }
        }
        // JDBC 메타데이터
        try {
            List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
            DatabaseMetaData md = s.conn.getMetaData();
            String jdbcPat = pat.replace('%', '%');
            ResultSet rs = md.getTables(null, own, jdbcPat, new String[] { "TABLE", "VIEW", "SYNONYM" });
            try {
                int i = 0;
                while (rs.next() && i++ < lim) {
                    Map<String, Object> m = Json.obj();
                    m.put("owner", rs.getString("TABLE_SCHEM"));
                    m.put("object_name", rs.getString("TABLE_NAME"));
                    m.put("object_type", rs.getString("TABLE_TYPE"));
                    m.put("status", null);
                    rows.add(m);
                }
            } finally { Sql.close(rs); }
            return result("JDBC", rows, "딕셔너리 뷰 접근이 불가하여 JDBC 메타데이터로 조회했습니다.");
        } catch (SQLException e) {
            return result("NONE", new ArrayList<Object>(),
                "객체 목록을 조회할 수 없습니다: " + e.getMessage());
        }
    }

    /** 컬럼 정의. */
    public static Map<String, Object> columns(Db.Session s, String owner, String table) {
        String own = (owner == null || owner.trim().isEmpty()) ? null : owner.trim().toUpperCase();
        String tab = table == null ? "" : table.trim().toUpperCase();
        if (tab.isEmpty()) return result("NONE", new ArrayList<Object>(), "테이블명이 비어 있습니다.");

        if (on(s, "all_tab_columns") && own != null) {
            try {
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT column_id, column_name, data_type, data_length, data_precision, data_scale, " +
                    "       nullable, data_default, char_used " +
                    "  FROM all_tab_columns WHERE owner = ? AND table_name = ? ORDER BY column_id",
                    new Object[] { own, tab }, 2000, 20);
                if (!r.isEmpty()) return result("ALL_TAB_COLUMNS", r, null);
            } catch (SQLException ignore) { }
        }
        try {
            List<Map<String, Object>> r = Sql.query(s.conn,
                "SELECT column_id, column_name, data_type, data_length, data_precision, data_scale, " +
                "       nullable, data_default, char_used " +
                "  FROM user_tab_columns WHERE table_name = ? ORDER BY column_id",
                new Object[] { tab }, 2000, 20);
            if (!r.isEmpty()) return result("USER_TAB_COLUMNS", r, null);
        } catch (SQLException ignore) { }

        try {
            List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
            DatabaseMetaData md = s.conn.getMetaData();
            ResultSet rs = md.getColumns(null, own, tab, "%");
            try {
                while (rs.next()) {
                    Map<String, Object> m = Json.obj();
                    m.put("column_id", Integer.valueOf(rs.getInt("ORDINAL_POSITION")));
                    m.put("column_name", rs.getString("COLUMN_NAME"));
                    m.put("data_type", rs.getString("TYPE_NAME"));
                    m.put("data_length", Integer.valueOf(rs.getInt("COLUMN_SIZE")));
                    m.put("data_precision", Integer.valueOf(rs.getInt("COLUMN_SIZE")));
                    m.put("data_scale", Integer.valueOf(rs.getInt("DECIMAL_DIGITS")));
                    m.put("nullable", rs.getInt("NULLABLE") == DatabaseMetaData.columnNoNulls ? "N" : "Y");
                    m.put("data_default", rs.getString("COLUMN_DEF"));
                    rows.add(m);
                }
            } finally { Sql.close(rs); }
            if (!rows.isEmpty()) {
                return result("JDBC", rows, "딕셔너리 접근이 불가하여 JDBC 메타데이터로 조회했습니다.");
            }
        } catch (SQLException ignore) { }

        // 최후 수단: 실행하지 않고 SELECT * 구조만 서술
        Map<String, Object> desc = describeQuery(s,
            "SELECT * FROM " + (own == null ? "" : Sql.quoteIdent(own) + ".") + Sql.quoteIdent(tab));
        if (Boolean.TRUE.equals(desc.get("ok"))) {
            List<Object> cols = Json.asList(desc.get("columns"));
            List<Object> rows = Json.arr();
            for (int i = 0; i < cols.size(); i++) {
                Map<String, Object> c = Json.asMap(cols.get(i));
                Map<String, Object> m = Json.obj();
                m.put("column_id", Integer.valueOf(i + 1));
                m.put("column_name", c.get("name"));
                m.put("data_type", c.get("typeName"));
                m.put("data_length", c.get("precision"));
                m.put("data_precision", c.get("precision"));
                m.put("data_scale", c.get("scale"));
                m.put("nullable", Integer.valueOf(1).equals(c.get("nullable")) ? "Y" : "N");
                rows.add(m);
            }
            return result("DESCRIBE_QUERY", rows,
                "딕셔너리·JDBC 메타데이터 모두 불가하여 쿼리 서술(실행 없이 구조만)로 대체했습니다.");
        }
        return result("NONE", new ArrayList<Object>(), "컬럼 정보를 얻을 수 없습니다.");
    }

    /** 인덱스와 구성 컬럼. */
    public static Map<String, Object> indexes(Db.Session s, String owner, String table) {
        String own = (owner == null || owner.trim().isEmpty()) ? null : owner.trim().toUpperCase();
        String tab = table == null ? "" : table.trim().toUpperCase();

        if (on(s, "all_indexes") && on(s, "all_ind_columns")) {
            try {
                String where = own != null ? "i.table_owner = ? AND i.table_name = ?" : "i.table_name = ?";
                Object[] binds = own != null ? new Object[] { own, tab } : new Object[] { tab };
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT i.owner, i.index_name, i.index_type, i.uniqueness, i.status, " +
                    "       i.num_rows, i.distinct_keys, i.clustering_factor, i.leaf_blocks, i.blevel, " +
                    "       TO_CHAR(i.last_analyzed,'YYYY-MM-DD') AS last_analyzed, " +
                    "       (SELECT LISTAGG(c.column_name, ', ') WITHIN GROUP (ORDER BY c.column_position) " +
                    "          FROM all_ind_columns c " +
                    "         WHERE c.index_owner = i.owner AND c.index_name = i.index_name) AS columns " +
                    "  FROM all_indexes i WHERE " + where + " ORDER BY i.index_name",
                    binds, 500, 20);
                if (!r.isEmpty()) return result("ALL_INDEXES", r, null);
            } catch (SQLException ignore) { }
        }
        try {
            List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
            DatabaseMetaData md = s.conn.getMetaData();
            ResultSet rs = md.getIndexInfo(null, own, tab, false, true);
            Map<String, Map<String, Object>> byName = new LinkedHashMap<String, Map<String, Object>>();
            try {
                while (rs.next()) {
                    String name = rs.getString("INDEX_NAME");
                    if (name == null) continue;
                    Map<String, Object> m = byName.get(name);
                    if (m == null) {
                        m = Json.obj();
                        m.put("owner", rs.getString("TABLE_SCHEM"));
                        m.put("index_name", name);
                        m.put("index_type", null);
                        m.put("uniqueness", rs.getBoolean("NON_UNIQUE") ? "NONUNIQUE" : "UNIQUE");
                        m.put("columns", "");
                        byName.put(name, m);
                    }
                    String cols = String.valueOf(m.get("columns"));
                    String c = rs.getString("COLUMN_NAME");
                    m.put("columns", cols.isEmpty() ? c : cols + ", " + c);
                }
            } finally { Sql.close(rs); }
            rows.addAll(byName.values());
            return result("JDBC", rows,
                rows.isEmpty() ? "인덱스 정보를 얻을 수 없습니다(권한 제한)." : "JDBC 메타데이터로 조회했습니다.");
        } catch (SQLException e) {
            return result("NONE", new ArrayList<Object>(), "인덱스 조회 불가: " + e.getMessage());
        }
    }

    /** 제약조건(PK/FK/UK/CHECK). */
    public static Map<String, Object> constraints(Db.Session s, String owner, String table) {
        String own = (owner == null || owner.trim().isEmpty()) ? null : owner.trim().toUpperCase();
        String tab = table == null ? "" : table.trim().toUpperCase();
        if (on(s, "all_constraints")) {
            try {
                String where = own != null ? "c.owner = ? AND c.table_name = ?" : "c.table_name = ?";
                Object[] binds = own != null ? new Object[] { own, tab } : new Object[] { tab };
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT c.constraint_name, c.constraint_type, c.status, c.search_condition, " +
                    "       c.r_constraint_name, " +
                    "       (SELECT LISTAGG(cc.column_name, ', ') WITHIN GROUP (ORDER BY cc.position) " +
                    "          FROM all_cons_columns cc " +
                    "         WHERE cc.owner = c.owner AND cc.constraint_name = c.constraint_name) AS columns " +
                    "  FROM all_constraints c WHERE " + where + " ORDER BY c.constraint_type, c.constraint_name",
                    binds, 500, 20);
                if (!r.isEmpty()) return result("ALL_CONSTRAINTS", r, null);
            } catch (SQLException ignore) { }
        }
        try {
            List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
            DatabaseMetaData md = s.conn.getMetaData();
            ResultSet rs = md.getPrimaryKeys(null, own, tab);
            try {
                StringBuilder cols = new StringBuilder();
                String pkName = null;
                while (rs.next()) {
                    pkName = rs.getString("PK_NAME");
                    if (cols.length() > 0) cols.append(", ");
                    cols.append(rs.getString("COLUMN_NAME"));
                }
                if (pkName != null) {
                    Map<String, Object> m = Json.obj();
                    m.put("constraint_name", pkName);
                    m.put("constraint_type", "P");
                    m.put("columns", cols.toString());
                    rows.add(m);
                }
            } finally { Sql.close(rs); }
            return result("JDBC", rows, "JDBC 메타데이터(PK만) 로 조회했습니다.");
        } catch (SQLException e) {
            return result("NONE", new ArrayList<Object>(), "제약조건 조회 불가: " + e.getMessage());
        }
    }

    /** 테이블 통계(행수·블록·최종분석). 옵티마이저 판단 근거를 사용자가 눈으로 확인하게 한다. */
    public static Map<String, Object> tableStats(Db.Session s, String owner, String table) {
        String own = (owner == null || owner.trim().isEmpty()) ? null : owner.trim().toUpperCase();
        String tab = table == null ? "" : table.trim().toUpperCase();
        if (on(s, "all_tab_statistics")) {
            try {
                String where = own != null ? "owner = ? AND table_name = ?" : "table_name = ?";
                Object[] binds = own != null ? new Object[] { own, tab } : new Object[] { tab };
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT num_rows, blocks, avg_row_len, sample_size, " +
                    "       TO_CHAR(last_analyzed,'YYYY-MM-DD HH24:MI:SS') AS last_analyzed, stale_stats " +
                    "  FROM all_tab_statistics WHERE " + where + " AND object_type = 'TABLE'",
                    binds, 5, 15);
                if (!r.isEmpty()) return result("ALL_TAB_STATISTICS", r, null);
            } catch (SQLException ignore) { }
        }
        try {
            List<Map<String, Object>> r = Sql.query(s.conn,
                "SELECT num_rows, blocks, avg_row_len, sample_size, " +
                "       TO_CHAR(last_analyzed,'YYYY-MM-DD HH24:MI:SS') AS last_analyzed " +
                "  FROM user_tables WHERE table_name = ?", new Object[] { tab }, 5, 15);
            if (!r.isEmpty()) return result("USER_TABLES", r, null);
        } catch (SQLException ignore) { }
        return result("NONE", new ArrayList<Object>(),
            "통계를 조회할 수 없습니다. 필요하면 실제 COUNT(*) 실측을 사용하세요(estimateRows).");
    }

    /** 컬럼 선택도 통계. 인덱스 후보 판단에 쓴다. */
    public static Map<String, Object> columnStats(Db.Session s, String owner, String table) {
        String own = (owner == null || owner.trim().isEmpty()) ? null : owner.trim().toUpperCase();
        String tab = table == null ? "" : table.trim().toUpperCase();
        if (on(s, "all_tab_col_statistics")) {
            try {
                String where = own != null ? "owner = ? AND table_name = ?" : "table_name = ?";
                Object[] binds = own != null ? new Object[] { own, tab } : new Object[] { tab };
                List<Map<String, Object>> r = Sql.query(s.conn,
                    "SELECT column_name, num_distinct, density, num_nulls, avg_col_len, histogram, num_buckets " +
                    "  FROM all_tab_col_statistics WHERE " + where + " ORDER BY column_name",
                    binds, 500, 15);
                if (!r.isEmpty()) return result("ALL_TAB_COL_STATISTICS", r, null);
            } catch (SQLException ignore) { }
        }
        return result("NONE", new ArrayList<Object>(), "컬럼 통계 조회 권한이 없습니다.");
    }

    /**
     * <b>실행하지 않고</b> 쿼리 결과 구조를 서술한다.
     * 딕셔너리가 전부 막힌 계정에서도 컬럼 타입을 알 수 있는 마지막 수단.
     */
    public static Map<String, Object> describeQuery(Db.Session s, String sql) {
        Map<String, Object> out = Json.obj();
        String cleaned = Plan.stripTrailingSemicolon(sql);
        PreparedStatement ps = null;
        try {
            ps = s.conn.prepareStatement(cleaned);
            ResultSetMetaData md = ps.getMetaData();
            if (md == null) {
                out.put("ok", Boolean.FALSE);
                out.put("error", "결과 집합이 없는 문장이거나 드라이버가 사전 서술을 지원하지 않습니다.");
                return out;
            }
            List<Object> cols = Json.arr();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                Map<String, Object> c = Json.obj();
                c.put("index", Integer.valueOf(i));
                c.put("name", md.getColumnLabel(i));
                c.put("typeName", md.getColumnTypeName(i));
                c.put("sqlType", Integer.valueOf(md.getColumnType(i)));
                c.put("precision", Integer.valueOf(safe(md, i, 1)));
                c.put("scale", Integer.valueOf(safe(md, i, 2)));
                c.put("nullable", Integer.valueOf(safe(md, i, 3)));
                c.put("numeric", Boolean.valueOf(Exec.isNumeric(md.getColumnType(i))));
                try { c.put("table", md.getTableName(i)); } catch (Throwable ignore) { }
                try { c.put("schema", md.getSchemaName(i)); } catch (Throwable ignore) { }
                cols.add(c);
            }
            out.put("ok", Boolean.TRUE);
            out.put("columns", cols);
            out.put("columnCount", Integer.valueOf(cols.size()));
            try {
                out.put("bindCount", Integer.valueOf(ps.getParameterMetaData().getParameterCount()));
            } catch (Throwable ignore) { }
        } catch (SQLException e) {
            out.put("ok", Boolean.FALSE);
            out.put("error", e.getMessage());
            out.put("ora", Db.oraCode(e.getMessage()));
        } finally {
            Sql.close(ps);
        }
        return out;
    }

    private static int safe(ResultSetMetaData md, int i, int what) {
        try {
            switch (what) {
                case 1: return md.getPrecision(i);
                case 2: return md.getScale(i);
                default: return md.isNullable(i);
            }
        } catch (Throwable t) { return 0; }
    }

    /** 실제 행수 실측(옵션). 통계가 없거나 낡았을 때 쓴다. 비용이 크므로 명시 요청에만 실행한다. */
    public static Map<String, Object> estimateRows(Db.Session s, String owner, String table,
                                                   Double samplePct, int timeoutSec) {
        Map<String, Object> out = Json.obj();
        String full = (owner == null || owner.trim().isEmpty() ? "" : Sql.quoteIdent(owner.trim().toUpperCase()) + ".")
            + Sql.quoteIdent(table == null ? "" : table.trim().toUpperCase());
        String sql;
        if (samplePct != null && samplePct.doubleValue() > 0 && samplePct.doubleValue() < 100) {
            sql = "SELECT COUNT(*) * (100/" + samplePct + ") AS est_rows FROM " + full +
                  " SAMPLE(" + samplePct + ")";
            out.put("method", "SAMPLE");
        } else {
            sql = "SELECT COUNT(*) AS est_rows FROM " + full;
            out.put("method", "COUNT");
        }
        long t0 = System.nanoTime();
        try {
            Object v = Sql.scalar(s.conn, sql, null, timeoutSec > 0 ? timeoutSec : 60);
            out.put("ok", Boolean.TRUE);
            out.put("rows", v);
            out.put("elapsedMs", Double.valueOf(Math.round((System.nanoTime() - t0) / 1e3) / 1e3));
        } catch (SQLException e) {
            out.put("ok", Boolean.FALSE);
            out.put("error", e.getMessage());
        }
        out.put("sql", sql);
        return out;
    }

    /** DDL 원문(가능한 경우). */
    public static Map<String, Object> ddl(Db.Session s, String type, String owner, String name) {
        Map<String, Object> out = Json.obj();
        String t = (type == null || type.trim().isEmpty()) ? "TABLE" : type.trim().toUpperCase();
        try {
            Object v = Sql.scalar(s.conn,
                "SELECT DBMS_METADATA.GET_DDL(?, ?, ?) FROM dual",
                new Object[] { t, name == null ? "" : name.trim().toUpperCase(),
                    owner == null || owner.trim().isEmpty() ? null : owner.trim().toUpperCase() }, 30);
            out.put("ok", Boolean.TRUE);
            out.put("ddl", v);
        } catch (SQLException e) {
            out.put("ok", Boolean.FALSE);
            out.put("error", e.getMessage());
            out.put("note", "DBMS_METADATA 실행 권한이 없으면 컬럼/인덱스 목록으로 대체하세요.");
        }
        return out;
    }
}
