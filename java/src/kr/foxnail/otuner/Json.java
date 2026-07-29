package kr.foxnail.otuner;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 의존성 없는 최소 JSON 코덱.
 *
 * <p>브리지는 외부 라이브러리 없이 {@code javac} 만으로 빌드되어야 한다(설치 환경에
 * Maven/Gradle 이 없을 수 있음). 그래서 JSON 처리를 직접 담는다.
 *
 * <p>파싱 결과 타입: {@link LinkedHashMap}(object), {@link ArrayList}(array),
 * {@link String}, {@link Double}/{@link Long}(number), {@link Boolean}, {@code null}.
 * 직렬화는 위 타입 + {@link Number} 전반을 지원하며, 그 외 객체는 {@code toString()} 문자열로 쓴다.
 */
public final class Json {

    private Json() {}

    // ── 직렬화 ────────────────────────────────────────────────────────────────

    public static String write(Object o) {
        StringBuilder sb = new StringBuilder(256);
        writeTo(sb, o);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void writeTo(StringBuilder sb, Object o) {
        if (o == null) { sb.append("null"); return; }
        if (o instanceof String) { writeString(sb, (String) o); return; }
        if (o instanceof Boolean) { sb.append(((Boolean) o) ? "true" : "false"); return; }
        if (o instanceof Double || o instanceof Float) {
            double d = ((Number) o).doubleValue();
            // JSON 에는 NaN/Infinity 가 없다 → null 로 떨어뜨린다.
            if (Double.isNaN(d) || Double.isInfinite(d)) { sb.append("null"); return; }
            if (d == Math.rint(d) && Math.abs(d) < 1e15) sb.append((long) d);
            else sb.append(d);
            return;
        }
        if (o instanceof Number) { sb.append(o.toString()); return; }
        if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                writeString(sb, String.valueOf(e.getKey()));
                sb.append(':');
                writeTo(sb, e.getValue());
            }
            sb.append('}');
            return;
        }
        if (o instanceof Iterable) {
            sb.append('[');
            boolean first = true;
            for (Object v : (Iterable<Object>) o) {
                if (!first) sb.append(',');
                first = false;
                writeTo(sb, v);
            }
            sb.append(']');
            return;
        }
        if (o instanceof Object[]) {
            sb.append('[');
            Object[] arr = (Object[]) o;
            for (int i = 0; i < arr.length; i++) {
                if (i > 0) sb.append(',');
                writeTo(sb, arr[i]);
            }
            sb.append(']');
            return;
        }
        writeString(sb, o.toString());
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        int n = s.length();
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    // 제어문자와 라인 구분자(U+2028/2029)는 이스케이프해야 JS 쪽에서 안전하다.
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    // ── 파싱 ──────────────────────────────────────────────────────────────────

    public static Object parse(String s) {
        P p = new P(s);
        p.ws();
        Object v = p.value();
        p.ws();
        return v;
    }

    private static final class P {
        private final String s;
        private int i;

        P(String s) { this.s = s; this.i = 0; }

        void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        Object value() {
            if (i >= s.length()) throw err("unexpected end");
            char c = s.charAt(i);
            switch (c) {
                case '{': return object();
                case '[': return array();
                case '"': return string();
                case 't': expect("true"); return Boolean.TRUE;
                case 'f': expect("false"); return Boolean.FALSE;
                case 'n': expect("null"); return null;
                default: return number();
            }
        }

        Map<String, Object> object() {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            i++; // {
            ws();
            if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
            while (true) {
                ws();
                String k = string();
                ws();
                if (i >= s.length() || s.charAt(i) != ':') throw err("expected ':'");
                i++;
                ws();
                m.put(k, value());
                ws();
                if (i >= s.length()) throw err("unterminated object");
                char c = s.charAt(i);
                if (c == ',') { i++; continue; }
                if (c == '}') { i++; return m; }
                throw err("expected ',' or '}'");
            }
        }

        List<Object> array() {
            List<Object> l = new ArrayList<Object>();
            i++; // [
            ws();
            if (i < s.length() && s.charAt(i) == ']') { i++; return l; }
            while (true) {
                ws();
                l.add(value());
                ws();
                if (i >= s.length()) throw err("unterminated array");
                char c = s.charAt(i);
                if (c == ',') { i++; continue; }
                if (c == ']') { i++; return l; }
                throw err("expected ',' or ']'");
            }
        }

        String string() {
            if (i >= s.length() || s.charAt(i) != '"') throw err("expected string");
            i++;
            StringBuilder sb = new StringBuilder();
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c != '\\') { sb.append(c); continue; }
                if (i >= s.length()) break;
                char e = s.charAt(i++);
                switch (e) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'u':
                        if (i + 4 > s.length()) throw err("bad unicode escape");
                        sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                        break;
                    default: sb.append(e);
                }
            }
            throw err("unterminated string");
        }

        Object number() {
            int start = i;
            if (i < s.length() && (s.charAt(i) == '-' || s.charAt(i) == '+')) i++;
            boolean isDouble = false;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') { i++; continue; }
                if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { isDouble = true; i++; continue; }
                break;
            }
            String raw = s.substring(start, i);
            if (raw.isEmpty()) throw err("invalid number");
            if (!isDouble) {
                try { return Long.valueOf(Long.parseLong(raw)); } catch (NumberFormatException ignore) { /* fall through */ }
            }
            return Double.valueOf(Double.parseDouble(raw));
        }

        void expect(String lit) {
            if (!s.startsWith(lit, i)) throw err("expected " + lit);
            i += lit.length();
        }

        IllegalArgumentException err(String msg) {
            return new IllegalArgumentException("JSON parse error at " + i + ": " + msg);
        }
    }

    // ── 편의 접근자 ───────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public static Map<String, Object> asMap(Object o) {
        return (o instanceof Map) ? (Map<String, Object>) o : new LinkedHashMap<String, Object>();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> asList(Object o) {
        return (o instanceof List) ? (List<Object>) o : new ArrayList<Object>();
    }

    public static String str(Map<String, Object> m, String k, String def) {
        Object v = m.get(k);
        return v == null ? def : String.valueOf(v);
    }

    public static int intv(Map<String, Object> m, String k, int def) {
        Object v = m.get(k);
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) {
            try { return Integer.parseInt(((String) v).trim()); } catch (NumberFormatException e) { return def; }
        }
        return def;
    }

    public static boolean bool(Map<String, Object> m, String k, boolean def) {
        Object v = m.get(k);
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof String) return "true".equalsIgnoreCase((String) v);
        if (v instanceof Number) return ((Number) v).intValue() != 0;
        return def;
    }

    public static Map<String, Object> obj() { return new LinkedHashMap<String, Object>(); }

    public static List<Object> arr() { return new ArrayList<Object>(); }
}
