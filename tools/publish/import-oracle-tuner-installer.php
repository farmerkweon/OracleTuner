<?php
/**
 * Oracle Tuner 1.0.0-beta.1 설치판 공개 — foxnail.kr 발행 임포터
 *
 * 이전 글(oracle-tuner-1-0-0-beta)을 고치는 게 아니라 **새 글**이다.
 * 이전 글은 "이 도구가 무엇인가"를, 이 글은 "설치판이 나왔다"를 다룬다.
 *
 * 원칙(PUBLISHING_GUIDE §9):
 *  - DB 직접 INSERT 금지. wp-load.php 를 require 해 WP 함수로만 넣는다.
 *  - 같은 slug 재실행 시 upsert (중복 글 방지).
 *  - 본문 heredoc 은 nowdoc(<<<'HTML') 으로 $ · 백틱 보존.
 *  - 색은 foxnail 디자인 SSOT 토큰만 사용 (--brand #2f6bff, --night #0f1626 등).
 *
 * 글감: docs/panel/PROMO-oracle-tuner.md (P-UI / 한명수)
 * 실행: php /tmp/import-oracle-tuner-installer.php
 */

require '/var/www/foxnail/wp-load.php';

$slug  = 'oracle-tuner-1-0-0-beta-installer';
$title = 'Oracle Tuner 베타, 이제 설치 파일로 받으세요';

/* ── 배포 파일·이미지 URL (업로드 완료 · 해시 대조 · HTTP 200 확인함) ── */
$base = 'https://foxnail.kr/wp-content/uploads/download/oracle-tuner/';
$img  = $base . 'img/';

$body = <<<'HTML'
<p class="lead"><strong>Oracle SQL을 실제로 돌려 보고 어느 쪽이 빠른지 알려 주는 도구입니다.</strong> 지난번에는 압축을 풀어서 쓰는 형태로만 냈는데, 이번에 설치 파일이 생겼습니다. 실행하면 언어부터 고르고, 안내를 따라가면 끝납니다.</p>

<h2>내려받기</h2>

<div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;"><a href="__EXE_JRE__" style="flex:1 1 320px;display:block;padding:16px 18px;border:2px solid var(--brand,#2f6bff);border-radius:4px;background:color-mix(in srgb, var(--brand,#2f6bff) 6%, transparent);text-decoration:none;color:var(--text,#111520);"><span style="display:block;font-weight:700;font-size:17px;color:var(--brand-strong,#1f4fd6);">설치판 · Java 포함 <span style="font-size:12px;color:var(--success,#1f9d57);">권장</span></span><span style="display:block;font-size:14px;color:var(--muted,#59616f);margin-top:4px;">Java가 없어도 바로 됩니다. 인터넷이 막힌 사내 PC·VDI에 이쪽이 맞습니다.</span><span style="display:block;font-size:12px;color:var(--muted,#59616f);margin-top:6px;font-family:ui-monospace,monospace;">EXE · 48.9 MB</span></a><a href="__EXE_NO__" style="flex:1 1 320px;display:block;padding:16px 18px;border:1px solid var(--border,#dae0e9);border-radius:4px;background:var(--surface,#fff);text-decoration:none;color:var(--text,#111520);"><span style="display:block;font-weight:700;font-size:17px;">설치판 · 기본</span><span style="display:block;font-size:14px;color:var(--muted,#59616f);margin-top:4px;">Java 11 이상이 이미 깔려 있는 곳에서 쓰세요. 더 가볍습니다.</span><span style="display:block;font-size:12px;color:var(--muted,#59616f);margin-top:6px;font-family:ui-monospace,monospace;">EXE · 31.0 MB</span></a></div>

<p style="font-size:13px;color:var(--muted,#59616f);">설치 없이 쓰고 싶다면 압축판도 그대로 있습니다 — <a href="__ZIP_JRE__">포터블 · Java 포함 (61.8 MB)</a> · <a href="__ZIP_NO__">포터블 · 기본 (41.2 MB)</a>. 관리자 권한은 없어도 됩니다. 내 폴더에 설치하면 그냥 깔립니다.</p>

<details>
<summary style="cursor:pointer;font-weight:600;">파일이 제대로 받아졌는지 확인용 SHA-256</summary>
<pre><code>설치판 Java 포함  c1bcbdae717159b5b3e12703f92146618df9253207cd25ac3bdad11c4cd78245
설치판 기본       202d9fb3cbb385e8931fe8030c057134b3f01d1d497a670e48299e7bb62be496</code></pre>
</details>

<h2>설치는 이렇게 진행됩니다</h2>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-setup-lang.png" alt="설치 언어 선택 창" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">설치를 시작하면 언어부터 고릅니다. 한국어 · English · 日本語 · 中文.</figcaption>
</figure>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-setup-port.png" alt="서버 포트를 정하는 설치 화면" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">포트도 설치할 때 정합니다. 기본은 7070이고, 이미 쓰는 번호면 바꾸면 됩니다.</figcaption>
</figure>

<p>라이선스 동의와 설치 위치를 지나면 끝입니다. <strong>검은 콘솔 창은 뜨지 않습니다.</strong> 제거 프로그램 목록에도 정상으로 올라가서, 지울 때 제어판에서 지우면 됩니다. 지워도 접속 정보와 튜닝 이력은 남습니다. 다시 깔면 그대로 이어서 씁니다.</p>

<h2>화면</h2>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-app-forest.png" alt="Oracle Tuner 기본 화면" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">SQL 목록 화면. 접속별로 SQL을 폴더에 정리해 둡니다.</figcaption>
</figure>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-app-dark.png" alt="어두운 테마를 적용한 화면" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">같은 화면, 어두운 테마. 이번부터 테마가 화면 전체에 적용됩니다.</figcaption>
</figure>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-workbench.webp" alt="튜닝 전후 SQL을 나란히 놓은 워크벤치" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">왼쪽이 튜닝 전, 오른쪽이 튜닝 후입니다. 실행하면 아래에 결과가 표로 뜹니다.</figcaption>
</figure>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-tournament.webp" alt="튜닝 후보와 토너먼트 실행 화면" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">[후보 생성]과 [토너먼트 실행] 두 번이면 됩니다. 튜닝을 몰라도 여기까지는 누구나 합니다.</figcaption>
</figure>

<h3>토너먼트를 돌리면 이렇게 나옵니다</h3>
<p>아래는 예제로 넣어 둔 SQL(문자 컬럼을 숫자와 비교한 조건)을 실제 Oracle에 붙여 돌린 화면입니다. 만든 화면이 아니라 진짜 결과입니다.</p>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-tournament-result.png" alt="토너먼트 실행이 끝난 뒤의 결과 화면" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">후보 6개를 3회전 번갈아 돌린 결과. 1순위로 "암시적 형변환 제거"를 골랐고, 응답시간이 96.7% 줄었습니다. 결과가 다른 후보는 0개입니다. 세션 통계를 볼 수 없는 계정이라 시간으로만 쟀다는 것도 화면에 그대로 적어 둡니다.</figcaption>
</figure>

<h3>빨라진 게 다가 아닙니다 — 답이 같은지도 봅니다</h3>
<p>1순위를 채택하면 오른쪽 편집기에 튜닝 후 SQL이 들어옵니다. 여기서 [비교 검증]을 누르면 두 SQL의 결과를 맞춰 봅니다.</p>

<figure style="margin:20px 0;">
  <img src="__IMG__ot-verify-result.png" alt="비교 검증 실행 후 결과 동일성과 개선율을 보여 주는 화면" style="max-width:100%;height:auto;border:1px solid var(--border,#dae0e9);border-radius:4px;">
  <figcaption style="font-size:13px;color:var(--muted,#59616f);margin-top:6px;">행 수도 6 → 6으로 같고, 순서까지 포함한 지문과 집합 지문이 모두 같습니다. 그래서 "결과 완전 동일"입니다. 응답시간은 28.4ms → 0.8ms(34.79배), 옵티마이저 비용은 5,229 → 10.</figcaption>
</figure>

<p style="font-size:14px;color:var(--muted,#59616f);">지문이 다르면 아무리 빨라도 순위에서 빠집니다. 무엇이 어떻게 다른지 표본과 함께 보여 줍니다.</p>

<h2>이번에 달라진 것</h2>

<h3>설치 파일이 생겼습니다</h3>
<p>지금까지는 압축을 풀고 <code>.bat</code> 파일을 눌러야 했습니다. 이제 exe 하나로 됩니다. 언어를 고르고, 라이선스에 동의하고, 설치 위치와 포트를 정하면 끝납니다.</p>

<h3>테마가 화면 전체에 적용됩니다</h3>
<p>전에는 표 색깔만 바뀌었습니다. 이제 화면 전체가 바뀝니다. 여덟 가지가 있고, 그중 어두운 계열도 여러 개라 밤에 눈이 덜 피곤합니다.</p>

<h3>토너먼트가 얼마나 진행됐는지 보입니다</h3>
<p>후보를 여러 개 돌리면 시간이 좀 걸립니다. 지금 몇 번째를 돌리고 있는지 화면에 나옵니다. 멈춘 건지 도는 중인지 몰라 답답할 일이 없습니다.</p>

<h3>오래된 Oracle에서도 후보가 제대로 만들어집니다</h3>
<p><code>FETCH FIRST</code>는 12c부터 되는 문법이라 11g 이하에서는 오류가 납니다. 이제 접속한 DB의 버전을 보고, 오래된 버전이면 예전 방식(인라인뷰 + ROWNUM)으로 후보를 만듭니다.</p>

<h3>그 밖에</h3>
<ul>
<li>접속 정보를 SQLite에 담습니다. 비밀번호는 암호로 바꿔서 넣고, 용량은 더 안 듭니다.</li>
<li>한 번에 읽는 행 수를 200만까지 올렸습니다. <strong>실제로 읽은 행</strong>과 <strong>화면에 보여 준 행</strong>을 나눠서 보여 줍니다.</li>
<li>도움말에 그림으로 된 설계 문서가 들어갔습니다. 구조도 여섯 장을 네 나라 말로 볼 수 있습니다.</li>
</ul>

<h2>이 도구가 다른 점</h2>
<p>SQL 튜닝을 도와준다는 도구는 많습니다. 그런데 대부분은 코드를 읽고 "이렇게 바꾸면 빠를 것 같다"까지만 말합니다. 실제로 돌려 보지는 않습니다.</p>
<p>이 도구는 돌려 봅니다.</p>
<ol>
<li><strong>번갈아 돌립니다.</strong> 한쪽을 여러 번 몰아서 돌리면 뒤쪽이 캐시 덕을 봐서 더 빨라 보입니다. 그래서 순서를 계속 바꿔 가며 돌립니다.</li>
<li><strong>끝까지 읽습니다.</strong> 앞부분만 읽고 멈추면 전체를 훑는 비용이 중간에 끊겨서, 튜닝 전후가 똑같이 빨라 보이는 착시가 생깁니다.</li>
<li><strong>답이 같은지 봅니다.</strong> 빨라졌다고 끝이 아닙니다. 행 하나하나를 지문으로 비교해서 원본과 같은 답인지 확인합니다. <strong>아무리 빨라도 답이 다르면 순위에서 뺍니다.</strong></li>
</ol>
<p>그래서 이 도구가 내놓는 숫자는 "그럴 것 같다"가 아니라 "돌려서 쟀다"는 숫자입니다.</p>

<p style="font-size:14px;color:var(--muted,#59616f);">도구가 무엇을 어떻게 하는지 더 자세한 이야기는 <a href="https://foxnail.kr/oracle-tuner-1-0-0-beta/">지난 글</a>에 적어 두었습니다.</p>

<h2>5분이면 효과를 직접 볼 수 있습니다</h2>
<p>말로만 빨라진다고 하면 믿기 어렵습니다. 그래서 시험용 데이터와 예제를 같이 넣었습니다.</p>
<ol>
<li><strong>[SQL 목록] → [샘플 예제]</strong> — 예제 10개가 들어옵니다.</li>
<li><strong>[데모 데이터 생성]</strong> — 30만 건짜리 시험용 표를 인덱스와 통계까지 만들어 줍니다. 1~2분 걸립니다.</li>
<li>예제를 열고 <strong>[튜닝 후보] → [후보 생성] → [토너먼트 실행]</strong></li>
</ol>
<p>순위와 개선율, 답이 같은지가 숫자로 나옵니다. 예제는 일부러 느리게 짜 놨는데, 그중에서도 <strong>숫자와 문자를 섞어 비교한 조건</strong>과 <strong>날짜에 함수를 씌운 조건</strong>이 차이가 제일 큽니다.</p>

<h2>필요한 것</h2>
<table>
<tbody>
<tr><td><strong>OS</strong></td><td>Windows x64</td></tr>
<tr><td><strong>Java</strong></td><td>Java 포함판은 필요 없음 / 기본판은 Java 11 이상</td></tr>
<tr><td><strong>Node.js</strong></td><td>필요 없음 (안에 들어 있음)</td></tr>
<tr><td><strong>Oracle</strong></td><td>11g 이상 (JDBC 드라이버 포함)</td></tr>
</tbody>
</table>
<p style="font-size:14px;color:var(--muted,#59616f);">처음 접속할 때 <strong>서비스명을 꼭 넣으세요.</strong> Oracle Free는 보통 <code>FREEPDB1</code>, XE는 <code>XEPDB1</code> 입니다.</p>

<div style="background:color-mix(in srgb, var(--warn,#b7770f) 8%, transparent);border:1px solid color-mix(in srgb, var(--warn,#b7770f) 35%, transparent);border-radius:4px;padding:14px 16px;margin:24px 0;">
<p style="margin:0 0 6px;font-weight:700;color:var(--warn,#b7770f);">⚠ 설치할 때 경고 창이 뜰 수 있습니다</p>
<p style="margin:0;font-size:14px;">exe에 아직 서명을 붙이지 못했습니다. 그래서 Windows가 "알 수 없는 게시자"라며 막을 수 있습니다. 그럴 때는 <strong>[추가 정보] → [실행]</strong> 으로 넘어가시면 됩니다. 미덥지 않으면 위의 SHA-256 값으로 받은 파일이 맞는지 확인해 보세요. 서명은 다음 버전에서 붙일 생각입니다.</p>
</div>

<div style="background:color-mix(in srgb, var(--warn,#b7770f) 8%, transparent);border:1px solid color-mix(in srgb, var(--warn,#b7770f) 35%, transparent);border-radius:4px;padding:14px 16px;margin:24px 0;">
<p style="margin:0 0 6px;font-weight:700;color:var(--warn,#b7770f);">⚠ 아직 베타입니다 — 마지막 확인은 직접 하세요</p>
<p style="margin:0;font-size:14px;">이 도구는 후보를 만들고 재서 근거를 보여 줄 뿐입니다. 잰 값은 표본이라 실제 운영 환경(데이터 양·통계·부하·바인드 값)과 다를 수 있습니다. <strong>운영에 넣기 전에 반드시 직접 확인</strong>하시고, 그 책임은 쓰는 분에게 있습니다. 만든 사람은 이 도구를 써서 생긴 일에 책임지지 않습니다.</p>
</div>

<h2>아직 안 되는 것</h2>
<ul>
<li>Windows x64만 됩니다. 리눅스와 macOS는 소스로 직접 돌려야 합니다.</li>
<li><code>V$MYSTAT</code> 권한이 없는 계정은 <strong>시간만으로</strong> 재기 때문에 값이 들쭉날쭉합니다. 이럴 때는 <strong>회전 수를 5~10으로 올려서</strong> 판단하세요.</li>
<li>안내 문구 일부는 아직 한국어만 있습니다. 주요 화면은 네 나라 말로 다 됩니다.</li>
<li>자동으로 만든 후보가 늘 맞는 SQL은 아닙니다. 문법이 틀린 후보는 이유와 함께 표시되고, 다른 후보를 재는 데는 영향을 주지 않습니다.</li>
</ul>

<h2>쓴 기술 · 라이선스</h2>
<ul>
<li>표와 차트: <strong>OPEN GRID</strong> (MIT) — <a href="https://foxnail.kr/open-grid/demo/v2/">가이드</a> · <a href="https://github.com/farmerkweon/OpenGrid">GitHub</a></li>
<li>DB 접근: Oracle JDBC (ojdbc) · Java 브리지</li>
<li>설치 파일: Inno Setup 6</li>
<li>Oracle Tuner 라이선스: <strong>MIT</strong></li>
</ul>

<div style="background:var(--night,#0f1626);border:1px solid var(--night-border,#233049);border-radius:4px;padding:16px 18px;margin:24px 0;color:var(--night-text,#eef2fb);">
<p style="margin:0 0 8px;font-weight:700;">만든 사람을 응원해 주세요 🙏</p>
<p style="margin:0 0 12px;font-size:14px;color:var(--night-muted,#aab4c9);">이 도구가 쓸모 있었다면, 아래 두 앱을 휴대폰에 깔고 즐겨 주세요. 큰 힘이 됩니다.</p>
<p style="margin:0 0 6px;"><a href="https://play.google.com/store/apps/details?id=com.foxnail.lotto_sudoku" style="color:#84a6ff;">🎱 로또 스도쿠 (Google Play)</a> <span style="font-size:13px;color:var(--night-muted,#aab4c9);">— 한국 로또뿐 아니라 파워볼과 여러 나라 로또 번호도 만들어 줍니다.</span></p>
<p style="margin:0 0 12px;"><a href="https://play.google.com/store/apps/details?id=com.artgrid.app.free" style="color:#84a6ff;">🎨 아트 그리드 (Google Play)</a></p>
<p style="margin:0;font-size:13px;color:var(--night-muted,#aab4c9);">앱이 마음에 드시면 공유 기능으로 주위에 알려 주시면 참 고맙겠습니다. 여력이 되면 아이폰 쪽도 만들어 보겠습니다.</p>
</div>

<p style="font-size:14px;color:var(--muted,#59616f);">문의: <a href="mailto:foxnail.biz@gmail.com">foxnail.biz@gmail.com</a></p>
HTML;

/* URL 치환 (nowdoc 이라 변수 확장이 안 되므로 여기서 바꾼다) */
$body = str_replace(
    ['__EXE_JRE__', '__EXE_NO__', '__ZIP_JRE__', '__ZIP_NO__', '__IMG__'],
    [
        $base . 'OracleTuner-1.0.0-beta.1-with-jre-Setup.exe',
        $base . 'OracleTuner-1.0.0-beta.1-Setup.exe',
        $base . 'oracle-tuner-1.0.0-beta.1-portable-win-x64-with-jre.zip',
        $base . 'oracle-tuner-1.0.0-beta.1-portable-win-x64-no-jre.zip',
        $img,
    ],
    $body
);

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
    'post_excerpt'  => 'Oracle Tuner 베타에 설치 파일이 생겼습니다. 언어를 고르고 안내를 따라가면 끝납니다. 테마가 화면 전체에 적용되고, 토너먼트 진행 상황이 보이고, 오래된 Oracle에서도 후보가 제대로 만들어집니다.',
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
echo "post_id  : {$id}\n";
echo "permalink: " . get_permalink($id) . "\n";
echo "category : {$cat->name} ({$cat->slug})\n";
