<?php
/**
 * Oracle Tuner 1.0.0-beta.1 릴리즈 노트 — foxnail.kr 발행 임포터
 *
 * 원칙(PUBLISHING_GUIDE §9):
 *  - DB 직접 INSERT 금지. wp-load.php 를 require 해 WP 함수로만 넣는다.
 *  - 같은 slug 재실행 시 upsert (중복 글 방지).
 *  - 본문 heredoc 은 nowdoc(<<<'HTML') 으로 $ · 백틱 보존.
 *  - 색은 foxnail 디자인 SSOT 토큰만 사용 (--brand #2f6bff, --night #0f1626 등).
 *
 * 실행: php /tmp/import-oracle-tuner-beta.php
 */

require '/var/www/foxnail/wp-load.php';

$slug  = 'oracle-tuner-1-0-0-beta';
$title = 'Oracle Tuner 1.0.0 베타 — SQL을 실제로 돌려서 튜닝하는 도구';

/* ── 다운로드 URL (업로드 완료·200 검증됨) ───────────────────────────── */
$base    = 'https://foxnail.kr/wp-content/uploads/download/oracle-tuner/';
$zipJre  = $base . 'oracle-tuner-1.0.0-beta.1-portable-win-x64-with-jre.zip';
$zipNo   = $base . 'oracle-tuner-1.0.0-beta.1-portable-win-x64-no-jre.zip';

$body = <<<'HTML'
<p class="lead"><strong>Oracle SQL을 실제로 실행해서 튜닝하는 도구입니다.</strong> 추측이 아니라 측정으로 판단합니다. 튜닝을 몰라도 최적 SQL을 고를 수 있게 만드는 것이 목표입니다.</p>

<h2>다운로드</h2>

<div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;">
  <a href="__ZIP_JRE__" style="flex:1 1 320px;display:block;padding:16px 18px;border:2px solid var(--brand,#2f6bff);border-radius:4px;background:color-mix(in srgb, var(--brand,#2f6bff) 6%, transparent);text-decoration:none;color:var(--text,#111520);">
    <div style="font-weight:700;font-size:17px;color:var(--brand-strong,#1f4fd6);">JRE 포함판 <span style="font-size:12px;color:var(--success,#1f9d57);">권장</span></div>
    <div style="font-size:14px;color:var(--muted,#59616f);margin-top:4px;">Java가 없어도 바로 실행됩니다. VDI·폐쇄망 환경에 적합.</div>
    <div style="font-size:12px;color:var(--muted,#59616f);margin-top:6px;font-family:ui-monospace,monospace;">ZIP · 61.8 MB</div>
  </a>
  <a href="__ZIP_NO__" style="flex:1 1 320px;display:block;padding:16px 18px;border:1px solid var(--border,#dae0e9);border-radius:4px;background:var(--surface,#fff);text-decoration:none;color:var(--text,#111520);">
    <div style="font-weight:700;font-size:17px;">기본판</div>
    <div style="font-size:14px;color:var(--muted,#59616f);margin-top:4px;">Java 11 이상이 이미 설치된 환경용. 더 가볍습니다.</div>
    <div style="font-size:12px;color:var(--muted,#59616f);margin-top:6px;font-family:ui-monospace,monospace;">ZIP · 41.2 MB</div>
  </a>
</div>

<p style="font-size:13px;color:var(--muted,#59616f);">설치 프로그램이 없습니다. <strong>압축을 풀고 <code>OracleTuner.bat</code> 을 더블클릭</strong>하면 브라우저가 열립니다. Node와 (포함판은) Java까지 안에 들어 있어 다른 설치가 필요 없습니다.</p>

<details>
<summary style="cursor:pointer;font-weight:600;">파일 검증용 SHA-256</summary>
<pre><code>with-jre  814c7b814fe55897d128148882920e98cb59a262bc377ddf84a00bf07aaa8952
no-jre    2c53fec4b93344121811d6f96490d588e32619c86767c26a1bcb8f6d959b4bc4</code></pre>
</details>

<h2>왜 만들었나</h2>
<p>SQL 튜닝은 경험이 필요합니다. "이 조건이 인덱스를 못 탄다", "이건 NOT EXISTS로 바꿔야 한다" 같은 판단을 하려면 아는 게 있어야 하죠. 그런데 대부분의 개발자는 그 지식 없이도 느린 SQL을 마주합니다.</p>
<p>그래서 <strong>도구가 대신 여러 안을 만들어 보고, 실제로 돌려서, 가장 나은 것을 골라 주는</strong> 방향으로 만들었습니다. 사람이 할 일은 결과를 보고 채택할지 정하는 것뿐입니다.</p>

<h2>어떻게 동작하나</h2>

<h3>1) 튜닝 후보를 자동으로 만든다</h3>
<p>SQL을 파싱해 시도해 볼 수 있는 개선안을 생성합니다. 30여 가지 전략이 들어 있습니다.</p>
<ul>
<li><strong>날짜 함수 → 범위 조건</strong> — <code>TO_CHAR(dt,'YYYYMM')='202403'</code> 을 부등호 범위로 바꿔 인덱스를 타게</li>
<li><strong>암시적 형변환 제거</strong> — 문자 컬럼을 숫자와 비교하면 컬럼 쪽이 변환되어 인덱스가 죽습니다</li>
<li><strong>NOT IN → NOT EXISTS</strong>, <strong>IN → EXISTS</strong>, <strong>NVL 분해</strong>, <strong>UNION → UNION ALL</strong></li>
<li><strong>ROWNUM + ORDER BY → FETCH FIRST</strong> — 이건 성능이 아니라 <em>결과가 틀리는</em> 문제를 잡습니다</li>
<li>인덱스·조인 방식·조인 순서 힌트 (실제 존재하는 인덱스 이름을 읽어서 채웁니다)</li>
</ul>
<p>각 후보마다 <strong>왜 이걸 시도하는지</strong>와 <strong>언제 효과가 있는지</strong>를 함께 보여줍니다. 그래서 쓰다 보면 배우게 됩니다.</p>

<h3>2) 토너먼트로 실제로 재본다</h3>
<p>원본과 후보들을 <strong>번갈아 여러 회전 실행</strong>합니다. 순차로 A를 n번, B를 n번 돌리면 뒤쪽이 캐시 덕을 봅니다. 회차마다 순서를 회전시켜 그 편향을 상쇄합니다.</p>
<p>측정은 결과를 <strong>끝까지 인출</strong>해서 합니다. 앞부분만 읽고 멈추면 전체 스캔의 비용이 중간에 끊겨 튜닝 전후가 똑같이 빨라 보이는 착시가 생깁니다.</p>

<h3>3) 결과가 같은지 검증한다</h3>
<p>빨라졌다고 끝이 아닙니다. 튜닝 후 SQL이 원본과 <strong>같은 답</strong>을 내는지 행 단위 지문(SHA-256)으로 확인합니다. 순서까지 같은지, 집합만 같은지도 구분합니다.</p>
<p><strong>아무리 빨라도 결과가 다르면 순위에서 제외</strong>합니다. 대신 "왜 다른지"를 표본과 함께 보여줍니다.</p>

<h3>4) 권한이 없어도 동작한다</h3>
<p>운영 계정은 <code>V$SQL</code>이나 딕셔너리를 못 보는 경우가 흔합니다. 접속하자마자 무엇을 볼 수 있는지 하나씩 실제로 찔러보고, 막힌 기능은 <strong>가능한 것 중 최선으로 자동 강등</strong>합니다.</p>
<ul>
<li>실행계획: <code>DBMS_XPLAN</code> → 계획 테이블 직접 조회 → 개인용 계획 테이블 생성</li>
<li>부하 측정: 세션 통계(논리읽기) → 없으면 시간만으로</li>
<li>결과 검증: <strong>권한과 무관하게 항상</strong> 가능 (행을 해시로 비교하므로)</li>
</ul>
<p>지금 무엇이 되고 안 되는지는 화면 상단 배지로 항상 보여줍니다.</p>

<h2>그 밖에</h2>
<ul>
<li><strong>4개 국어</strong> — 한국어 / English / 日本語 / 中文</li>
<li><strong>SQL 라이브러리</strong> — 접속별로 SQL을 폴더로 정리해 보관. 며칠에 걸친 작업도 이어서 합니다</li>
<li><strong>힌트 위저드</strong> — 힌트 이름을 몰라도 상황만 고르면 표·인덱스명이 자동으로 채워집니다</li>
<li><strong>안전모드</strong> — DML/DDL을 실행해도 실수로 데이터가 바뀌지 않도록 자동 되돌림(기본 켜짐)</li>
<li><strong>큰 SQL</strong> — 1만 줄이 넘어도 잘림 없이 처리합니다. 주석·문자열·q-quote·한글 식별자 모두 인식</li>
</ul>

<h2>튜닝 효과를 5분 안에 확인해 보세요</h2>
<p>말로만 "빨라진다"고 하면 믿기 어렵죠. 그래서 <strong>시험용 데이터와 예제를 함께 넣었습니다.</strong></p>
<ol>
<li><strong>[SQL 목록]</strong> → <strong>[샘플 예제]</strong> — 예제 10건이 설치됩니다</li>
<li><strong>[데모 데이터 생성]</strong> — 버튼 하나로 30만 건짜리 시험용 표·인덱스·통계까지 자동 생성 (1~2분)</li>
<li>예제를 열고 <strong>[튜닝 후보]</strong> → <strong>[후보 생성]</strong> → <strong>[토너먼트 실행]</strong></li>
</ol>
<p>순위·개선율·결과 동일성이 숫자로 나옵니다. 예제는 일부러 느리게 짜여 있고, 특히 <strong>암시적 형변환</strong>과 <strong>날짜 함수 조건</strong>이 차이가 가장 큽니다.</p>

<h2>요구 사항</h2>
<table>
<tbody>
<tr><td><strong>OS</strong></td><td>Windows x64</td></tr>
<tr><td><strong>Java</strong></td><td>JRE 포함판은 불필요 / 기본판은 Java 11 이상</td></tr>
<tr><td><strong>Node.js</strong></td><td>불필요 (내장)</td></tr>
<tr><td><strong>Oracle</strong></td><td>11g 이상 (JDBC 드라이버 포함)</td></tr>
</tbody>
</table>
<p style="font-size:14px;color:var(--muted,#59616f);">처음 접속할 때 <strong>서비스명을 반드시 입력</strong>하세요. Oracle Free는 보통 <code>FREEPDB1</code>, XE는 <code>XEPDB1</code> 입니다.</p>

<div style="background:color-mix(in srgb, var(--warn,#b7770f) 8%, transparent);border:1px solid color-mix(in srgb, var(--warn,#b7770f) 35%, transparent);border-radius:4px;padding:14px 16px;margin:24px 0;">
<p style="margin:0 0 6px;font-weight:700;color:var(--warn,#b7770f);">⚠ 베타입니다 — SQL 최종 검증은 사용자의 몫입니다</p>
<p style="margin:0;font-size:14px;">이 도구는 후보를 만들고 성능·결과를 <strong>측정하여 근거를 제시</strong>할 뿐입니다. 측정은 표본이며 실제 운영 환경(데이터량·통계·부하·바인드 값)과 다를 수 있습니다. <strong>운영에 반영하기 전 반드시 직접 최종 검증</strong>하시고, 그 적용 책임은 사용자에게 있습니다. 제작자는 이 도구 사용으로 발생한 결과에 대해 책임지지 않습니다.</p>
</div>

<h2>알려진 제한</h2>
<ul>
<li>Windows x64만 제공합니다 (리눅스·macOS는 소스로 실행 가능).</li>
<li><code>V$MYSTAT</code> 권한이 없는 계정은 <strong>시간만으로</strong> 측정하므로 편차가 큽니다. 이 경우 <strong>회전 수를 5~10으로 올려</strong> 판정하세요.</li>
<li>일부 안내 문구는 아직 한국어만 제공됩니다 (주요 UI는 4개 국어 완료).</li>
<li>자동 생성한 후보가 항상 문법적으로 유효하지는 않습니다. 실패한 후보는 사유와 함께 표시되며 다른 후보의 측정에는 영향을 주지 않습니다.</li>
</ul>

<h2>사용 기술 · 라이선스</h2>
<ul>
<li>데이터 그리드·차트: <strong>OPEN GRID</strong> (MIT) — <a href="https://foxnail.kr/open-grid/demo/v2/">가이드</a> · <a href="https://github.com/farmerkweon/OpenGrid">GitHub</a></li>
<li>DB 접근: Oracle JDBC (ojdbc) · Java 브리지</li>
<li>Oracle Tuner 라이선스: <strong>MIT</strong></li>
</ul>

<div style="background:var(--night,#0f1626);border:1px solid var(--night-border,#233049);border-radius:4px;padding:16px 18px;margin:24px 0;color:var(--night-text,#eef2fb);">
<p style="margin:0 0 8px;font-weight:700;">개발자를 응원해 주세요 🙏</p>
<p style="margin:0 0 12px;font-size:14px;color:var(--night-muted,#aab4c9);">이 도구가 도움이 되셨다면, 개발자를 위해 아래 두 앱을 휴대폰에 설치하고 즐겨 주세요. 큰 힘이 됩니다.</p>
<p style="margin:0 0 6px;"><a href="https://play.google.com/store/apps/details?id=com.foxnail.lotto_sudoku" style="color:#84a6ff;">🎱 로또 스도쿠 (Google Play)</a></p>
<p style="margin:0 0 12px;"><a href="https://play.google.com/store/apps/details?id=com.artgrid.app.free" style="color:#84a6ff;">🎨 아트 그리드 (Google Play)</a></p>
<p style="margin:0;font-size:13px;color:var(--night-muted,#aab4c9);">앱이 만족스러우면 공유 기능으로 주위 분들께 전해 주시면 참으로 감사하겠습니다. 여력이 되면 아이폰 사용자를 위해서도 만들어 보겠습니다.</p>
</div>

<p style="font-size:14px;color:var(--muted,#59616f);">문의: <a href="mailto:foxnail.biz@gmail.com">foxnail.biz@gmail.com</a></p>
HTML;

/* 다운로드 URL 치환 (nowdoc 이라 변수 확장이 안 되므로 여기서 바꾼다) */
$body = str_replace(['__ZIP_JRE__', '__ZIP_NO__'], [$zipJre, $zipNo], $body);

/* ── 카테고리: 오픈소스 (slug 로 조회 — ID 하드코딩 금지) ───────────── */
$cat = get_category_by_slug('opensource');
if (!$cat) { fwrite(STDERR, "카테고리 opensource 없음\n"); exit(1); }

/* ── upsert (같은 slug 재실행 시 갱신) ──────────────────────────────── */
$existing = get_page_by_path($slug, OBJECT, 'post');

$postarr = [
    'post_title'    => $title,
    'post_name'     => $slug,
    'post_content'  => $body,
    'post_status'   => 'publish',
    'post_type'     => 'post',
    'post_excerpt'  => 'Oracle SQL을 실제로 실행해 여러 튜닝안을 겨루게 하고, 결과가 같은지까지 검증해 최적안을 골라 주는 도구. 포터블 베타 공개.',
    'post_category' => [$cat->term_id],
];

if ($existing) {
    $postarr['ID'] = $existing->ID;
    $id = wp_update_post($postarr, true);
    $mode = 'UPDATE';
} else {
    $id = wp_insert_post($postarr, true);
    $mode = 'INSERT';
}

if (is_wp_error($id)) { fwrite(STDERR, "실패: " . $id->get_error_message() . "\n"); exit(1); }

echo "{$mode} OK\n";
echo "post_id : {$id}\n";
echo "permalink: " . get_permalink($id) . "\n";
echo "category : {$cat->name} ({$cat->slug})\n";
