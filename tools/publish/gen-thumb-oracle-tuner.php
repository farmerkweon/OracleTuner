<?php
/**
 * Oracle Tuner 베타 글 대표이미지 생성 + 첨부 + 지정 (foxnail.kr)
 *
 * 블로그 글 썸네일 표준(디자인 SSOT):
 *   2400×1260 (2x) · 그라데이션 + 은은한 34px 격자(코드의 결) + 카드 컴포넌트 + 하단 모노 라인
 * 색은 SSOT 토큰만:
 *   --brand #2f6bff · --brand-strong #1f4fd6 · --night #0f1626 · --night-border #233049
 *   --night-text #eef2fb · --night-muted #aab4c9 · --code-fg #c7d2e6 · --success #1f9d57
 * 한글 폰트(서버 시스템엔 한글 폰트가 없다 — 반드시 이 경로):
 *   /var/www/foxnail/wp-content/tools/fonts/NotoSansKR-{Bold,Regular}.ttf
 *
 * 실행: php /tmp/gen-thumb-oracle-tuner.php
 */

if (php_sapi_name() !== 'cli') { exit("CLI only\n"); }
if (!function_exists('imagettftext')) { fwrite(STDERR, "GD/freetype 필요\n"); exit(1); }

require '/var/www/foxnail/wp-load.php';

$TOOLS  = '/var/www/foxnail/wp-content/tools';
$FONT_B = "$TOOLS/fonts/NotoSansKR-Bold.ttf";
$FONT_R = "$TOOLS/fonts/NotoSansKR-Regular.ttf";
foreach ([$FONT_B, $FONT_R] as $f) {
    if (!is_file($f)) { fwrite(STDERR, "폰트 없음: $f\n"); exit(1); }
}

$POST_ID = 440;
$SLUG    = 'oracle-tuner-1-0-0-beta';
$W = 2400; $H = 1260;   // 2x
$S = 2;                 // 스케일(1x 설계값 × 2)

/* ── 헬퍼 (참고본 gen-og-images.php 와 동일 구현) ── */
function rrect($im, $x, $y, $w, $h, $r, $col) {
    imagefilledrectangle($im, $x + $r, $y, $x + $w - $r, $y + $h, $col);
    imagefilledrectangle($im, $x, $y + $r, $x + $w, $y + $h - $r, $col);
    imagefilledarc($im, $x + $r,      $y + $r,      $r*2, $r*2, 180, 270, $col, IMG_ARC_PIE);
    imagefilledarc($im, $x + $w - $r, $y + $r,      $r*2, $r*2, 270, 360, $col, IMG_ARC_PIE);
    imagefilledarc($im, $x + $r,      $y + $h - $r, $r*2, $r*2,  90, 180, $col, IMG_ARC_PIE);
    imagefilledarc($im, $x + $w - $r, $y + $h - $r, $r*2, $r*2,   0,  90, $col, IMG_ARC_PIE);
}
function tw($size, $font, $text) {          // 텍스트 폭
    $bb = imagettfbbox($size, 0, $font, $text);
    return $bb[2] - $bb[0];
}

$im = imagecreatetruecolor($W, $H);
imagealphablending($im, true);

/* ── 배경: 나이트 그라데이션 (--night 계열) ── */
$top = array(0x14, 0x1c, 0x2e);   // #141c2e (night 보다 살짝 밝게)
$bot = array(0x0b, 0x10, 0x1c);   // #0b101c
for ($y = 0; $y < $H; $y++) {
    $t = $y / $H;
    $c = imagecolorallocate($im,
        (int)($top[0] + ($bot[0]-$top[0])*$t),
        (int)($top[1] + ($bot[1]-$top[1])*$t),
        (int)($top[2] + ($bot[2]-$top[2])*$t));
    imageline($im, 0, $y, $W, $y, $c);
}

/* ── 텍스처: 34px 격자(코드의 결) — 2x 이므로 68px ── */
$grid = imagecolorallocatealpha($im, 0x23, 0x30, 0x49, 108);   // --night-border, 매우 옅게
for ($x = 0; $x < $W; $x += 34 * $S) imageline($im, $x, 0, $x, $H, $grid);
for ($y = 0; $y < $H; $y += 34 * $S) imageline($im, 0, $y, $W, $y, $grid);

/* ── 좌상단 애저 글로우 (--brand) ── */
$glow = imagecolorallocatealpha($im, 0x2f, 0x6b, 0xff, 118);
imagefilledellipse($im, 220 * $S, -60 * $S, 900 * $S, 900 * $S, $glow);
$glow2 = imagecolorallocatealpha($im, 0x1f, 0x4f, 0xd6, 122);
imagefilledellipse($im, 1100 * $S, 700 * $S, 700 * $S, 700 * $S, $glow2);

/* ── 색 ── */
$text   = imagecolorallocate($im, 0xee, 0xf2, 0xfb);  // --night-text
$muted  = imagecolorallocate($im, 0xaa, 0xb4, 0xc9);  // --night-muted
$brand  = imagecolorallocate($im, 0x2f, 0x6b, 0xff);  // --brand
$brandL = imagecolorallocate($im, 0x84, 0xa6, 0xff);  // 다크 --brand-strong
$codefg = imagecolorallocate($im, 0xc7, 0xd2, 0xe6);  // --code-fg
$succ   = imagecolorallocate($im, 0x1f, 0x9d, 0x57);  // --success
$cardBg = imagecolorallocatealpha($im, 0x0f, 0x16, 0x26, 40);   // --night 반투명
$cardBd = imagecolorallocate($im, 0x23, 0x30, 0x49);            // --night-border

$PAD = 110 * $S / 2;   // 110px(1x) → 220

/* ── BETA 배지 ── */
$bx = $PAD; $by = 120;
$badge = 'BETA';
$bw = tw(26 * $S, $FONT_B, $badge) + 34 * $S;
rrect($im, $bx, $by, $bw, 34 * $S, 4 * $S, $brand);
imagettftext($im, 26 * $S, 0, $bx + 17 * $S, $by + 24 * $S, imagecolorallocate($im,255,255,255), $FONT_B, $badge);

/* ── 제목 ── */
imagettftext($im, 68 * $S, 0, $PAD, 300, $text, $FONT_B, 'Oracle Tuner');
imagettftext($im, 30 * $S, 0, $PAD + tw(68 * $S, $FONT_B, 'Oracle Tuner') + 24 * $S, 300, $muted, $FONT_R, '1.0.0');

/* ── 부제 ── */
imagettftext($im, 34 * $S, 0, $PAD, 390, $brandL, $FONT_B, 'SQL을 실제로 돌려서 튜닝하는 도구');
imagettftext($im, 24 * $S, 0, $PAD, 452, $muted,  $FONT_R, '추측이 아니라 측정으로 판단합니다');

/* ── 카드 3장: 핵심 가치 ── */
$cards = array(
    array('후보 자동 생성', '30여 가지 전략으로', '개선안을 만들어'),
    array('토너먼트 실측',   '번갈아 여러 회전 실행해', '속도·부하를 재고'),
    array('결과 동일성 검증', '같은 답을 내는지', '확인한 뒤 순위를'),
);
$cw = 560; $ch = 300; $gap = 40;
$cx = $PAD; $cy = 560;
foreach ($cards as $i => $c) {
    $x = $cx + $i * ($cw + $gap);
    rrect($im, $x, $cy, $cw, $ch, 4 * $S, $cardBd);           // 테두리(Sharp: 링)
    rrect($im, $x + 2, $cy + 2, $cw - 4, $ch - 4, 4 * $S, $cardBg);
    imagettftext($im, 26 * $S, 0, $x + 40, $cy + 90,  $text,  $FONT_B, $c[0]);
    // 본문 18pt(2x=36px) 은 줄높이가 60px 이상 필요하다 — 42px 로 두면 글자가 겹친다
    imagettftext($im, 18 * $S, 0, $x + 40, $cy + 168, $muted, $FONT_R, $c[1]);
    imagettftext($im, 18 * $S, 0, $x + 40, $cy + 232, $muted, $FONT_R, $c[2]);
}

/* ── 하단 모노 라인 (블로그 글 썸네일 표준) ── */
$mono = is_file('/usr/share/fonts/redhat-vf/RedHatMono[wght].ttf')
      ? '/usr/share/fonts/redhat-vf/RedHatMono[wght].ttf' : $FONT_R;   // 라틴 전용이므로 영문만
$line = 'Windows portable  ·  Node + JRE bundled  ·  MIT License';
imagettftext($im, 20 * $S, 0, $PAD, $H - 120, $codefg, $mono, $line);

/* 하단 브랜드 바 */
imagefilledrectangle($im, 0, $H - 12, $W, $H, $brand);
imagettftext($im, 20 * $S, 0, $W - tw(20 * $S, $FONT_B, 'foxnail.kr') - $PAD, $H - 120, $brandL, $FONT_B, 'foxnail.kr');

/* ── 저장 ── */
$tmp = '/tmp/oracle-tuner-og.png';
imagepng($im, $tmp, 6);
imagedestroy($im);
echo "생성: $tmp (" . round(filesize($tmp)/1024) . " KB)\n";

/* ── WP 미디어 등록 + 대표이미지 지정 (재실행 대비 idempotent) ── */
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$IMGKEY = 'ot-beta-og-v1';

/* 같은 키로 이미 올린 첨부가 있으면 재사용 */
$found = get_posts(array(
    'post_type'   => 'attachment',
    'numberposts' => 1,
    'meta_key'    => '_ot_imgkey',
    'meta_value'  => $IMGKEY,
    'fields'      => 'ids',
));

if ($found) {
    $att_id = $found[0];
    echo "기존 첨부 재사용: $att_id\n";
    /* 파일만 갱신 */
    $path = get_attached_file($att_id);
    if ($path && copy($tmp, $path)) {
        wp_update_attachment_metadata($att_id, wp_generate_attachment_metadata($att_id, $path));
        echo "첨부 파일 갱신 완료\n";
    }
} else {
    $file = array('name' => 'oracle-tuner-1-0-0-beta-og.png', 'tmp_name' => $tmp);
    $att_id = media_handle_sideload($file, $POST_ID, 'Oracle Tuner 1.0.0 베타');
    if (is_wp_error($att_id)) { fwrite(STDERR, "sideload 실패: " . $att_id->get_error_message() . "\n"); exit(1); }
    update_post_meta($att_id, '_ot_imgkey', $IMGKEY);
    echo "신규 첨부: $att_id\n";
}

set_post_thumbnail($POST_ID, $att_id);

echo "thumbnail_id : " . get_post_thumbnail_id($POST_ID) . "\n";
echo "image url    : " . wp_get_attachment_url($att_id) . "\n";
echo "post         : " . get_permalink($POST_ID) . "\n";

if (file_exists($tmp)) { @unlink($tmp); }
