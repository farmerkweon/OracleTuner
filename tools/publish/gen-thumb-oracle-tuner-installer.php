<?php
/**
 * Oracle Tuner 설치판 글(post 445) 대표이미지 생성 + 첨부 + 지정 (foxnail.kr)
 *
 * 블로그 글 썸네일 표준(디자인 SSOT):
 *   2400×1260 (2x) · 그라데이션 + 은은한 34px 격자(코드의 결) + 카드 컴포넌트 + 하단 모노 라인
 * 색은 SSOT 토큰만:
 *   --brand #2f6bff · --brand-strong #1f4fd6 · --night #0f1626 · --night-border #233049
 *   --night-text #eef2fb · --night-muted #aab4c9 · --code-fg #c7d2e6 · --success #1f9d57
 *
 * 이전 글 썸네일(gen-thumb-oracle-tuner.php)은 카드 3장으로 "무엇을 하는 도구인가"를 말했다.
 * 이 글의 소식은 "설치 파일이 생겼다"이므로, 오른쪽에 설치 마법사 창을 그려 그 이야기를 보이게 한다.
 *
 * 한글 폰트(서버 시스템엔 한글 폰트가 없다 — 반드시 이 경로):
 *   /var/www/foxnail/wp-content/tools/fonts/NotoSansKR-{Bold,Regular}.ttf
 *
 * 실행: php /tmp/gen-thumb-oracle-tuner-installer.php
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

$POST_ID = 445;
$W = 2400; $H = 1260;   // 2x
$S = 2;                 // 스케일(1x 설계값 × 2)

/* ── 헬퍼 ── */
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

/* ── 배경: 나이트 그라데이션 ── */
$top = array(0x14, 0x1c, 0x2e);
$bot = array(0x0b, 0x10, 0x1c);
for ($y = 0; $y < $H; $y++) {
    $t = $y / $H;
    $c = imagecolorallocate($im,
        (int)($top[0] + ($bot[0]-$top[0])*$t),
        (int)($top[1] + ($bot[1]-$top[1])*$t),
        (int)($top[2] + ($bot[2]-$top[2])*$t));
    imageline($im, 0, $y, $W, $y, $c);
}

/* ── 텍스처: 34px 격자(코드의 결) — 2x 이므로 68px ── */
$grid = imagecolorallocatealpha($im, 0x23, 0x30, 0x49, 108);
for ($x = 0; $x < $W; $x += 34 * $S) imageline($im, $x, 0, $x, $H, $grid);
for ($y = 0; $y < $H; $y += 34 * $S) imageline($im, 0, $y, $W, $y, $grid);

/* ── 애저 글로우 ── */
$glow = imagecolorallocatealpha($im, 0x2f, 0x6b, 0xff, 118);
imagefilledellipse($im, 220 * $S, -60 * $S, 900 * $S, 900 * $S, $glow);
$glow2 = imagecolorallocatealpha($im, 0x1f, 0x4f, 0xd6, 124);
imagefilledellipse($im, 1000 * $S, 780 * $S, 800 * $S, 800 * $S, $glow2);

/* ── 색 ── */
$white  = imagecolorallocate($im, 0xff, 0xff, 0xff);
$text   = imagecolorallocate($im, 0xee, 0xf2, 0xfb);  // --night-text
$muted  = imagecolorallocate($im, 0xaa, 0xb4, 0xc9);  // --night-muted
$brand  = imagecolorallocate($im, 0x2f, 0x6b, 0xff);  // --brand
$brandL = imagecolorallocate($im, 0x84, 0xa6, 0xff);
$codefg = imagecolorallocate($im, 0xc7, 0xd2, 0xe6);  // --code-fg
$succ   = imagecolorallocate($im, 0x1f, 0x9d, 0x57);  // --success
$cardBd = imagecolorallocate($im, 0x23, 0x30, 0x49);  // --night-border

$PAD = 110 * $S;   // 220

/* 왼쪽 글 영역의 오른쪽 한계. 이 선을 넘으면 오른쪽 마법사 창과 겹친다. */
$LEFT_MAX = 1200;

/* ── BETA 배지 ── */
$by = 150;
$badge = 'BETA';
$bw = tw(24 * $S, $FONT_B, $badge) + 32 * $S;
rrect($im, $PAD, $by, $bw, 32 * $S, 4 * $S, $brand);
imagettftext($im, 24 * $S, 0, $PAD + 16 * $S, $by + 22 * $S, $white, $FONT_B, $badge);

/* 배지 옆: 버전 */
imagettftext($im, 20 * $S, 0, $PAD + $bw + 28, $by + 22 * $S, $muted, $FONT_R, '1.0.0-beta.1');

/* ── 제목 ── */
imagettftext($im, 56 * $S, 0, $PAD, 400, $text, $FONT_B, 'Oracle Tuner');

/* ── 부제 (이번 글의 소식) — 한 줄로 두고, 넘치면 글자를 줄인다 ── */
$sub = '이제 설치 파일로 받으세요';
$subPt = 30 * $S;
while ($subPt > 18 * $S && $PAD + tw($subPt, $FONT_B, $sub) > $LEFT_MAX) { $subPt -= 2; }
imagettftext($im, $subPt, 0, $PAD, 520, $brandL, $FONT_B, $sub);

imagettftext($im, 19 * $S, 0, $PAD, 600, $muted, $FONT_R, '언어를 고르고, 안내를 따라가면 끝납니다');

/* ── 특징 알약(pill) — 왼쪽 영역을 넘으면 먼저 줄을 바꾼다 ── */
$pills = array('설치 마법사 4개 국어', '테마 8종', '토너먼트 실측');
$px = $PAD; $py = 660;
$pillPt = 18 * $S;
foreach ($pills as $p) {
    $pw = tw($pillPt, $FONT_R, $p) + 36 * $S;
    if ($px + $pw > $LEFT_MAX) { $px = $PAD; $py += 40 * $S; }   // 그리기 전에 판단해야 안 삐져나간다
    rrect($im, $px, $py, $pw, 28 * $S, 4 * $S, $cardBd);
    imagettftext($im, $pillPt, 0, $px + 18 * $S, $py + 20 * $S, $codefg, $FONT_R, $p);
    $px += $pw + 14 * $S;
}

/* ── 오른쪽: 설치 마법사 창 그림 ──────────────────────────────────────
   이 글의 소식이 "설치 파일"이므로 실제 마법사를 닮은 카드를 그린다.
   어두운 배경 위의 밝은 창이라 시선이 자연스럽게 이쪽으로 온다. */
$winX = 1290; $winY = 250; $winW = 890; $winH = 700;

/* 그림자 */
$shadow = imagecolorallocatealpha($im, 0x00, 0x00, 0x00, 96);
rrect($im, $winX + 10, $winY + 14, $winW, $winH, 6 * $S, $shadow);

$winBg   = imagecolorallocate($im, 0xf6, 0xf8, 0xfc);
$winBar  = imagecolorallocate($im, 0xe6, 0xeb, 0xf5);
$winLine = imagecolorallocate($im, 0xd2, 0xda, 0xe8);
$winText = imagecolorallocate($im, 0x11, 0x15, 0x20);
$winMute = imagecolorallocate($im, 0x59, 0x61, 0x6f);

rrect($im, $winX, $winY, $winW, $winH, 6 * $S, $winBg);
/* 제목 표시줄 */
imagefilledrectangle($im, $winX, $winY + 6 * $S, $winX + $winW, $winY + 34 * $S, $winBar);
rrect($im, $winX, $winY, $winW, 34 * $S, 6 * $S, $winBar);
imageline($im, $winX, $winY + 34 * $S, $winX + $winW, $winY + 34 * $S, $winLine);
imagettftext($im, 17 * $S, 0, $winX + 22 * $S, $winY + 24 * $S, $winText, $FONT_R, '설치 - Oracle Tuner 1.0.0-beta.1');

/* 페이지 제목 */
imagettftext($im, 21 * $S, 0, $winX + 30 * $S, $winY + 78 * $S, $winText, $FONT_B, '서버 포트');
imagettftext($im, 16 * $S, 0, $winX + 30 * $S, $winY + 108 * $S, $winMute, $FONT_R, 'Oracle Tuner 가 사용할 포트를 정합니다.');

/* 입력 라벨 + 입력칸 */
imagettftext($im, 16 * $S, 0, $winX + 30 * $S, $winY + 178 * $S, $winText, $FONT_R, '웹 화면을 여는 포트 번호 (1024~65535):');
$inX = $winX + 30 * $S; $inY = $winY + 194 * $S; $inW = $winW - 60 * $S; $inH = 40 * $S;
rrect($im, $inX, $inY, $inW, $inH, 3 * $S, $white);
imagerectangle($im, $inX, $inY, $inX + $inW, $inY + $inH, $brand);
imagerectangle($im, $inX+1, $inY+1, $inX + $inW-1, $inY + $inH-1, $brand);
imagettftext($im, 18 * $S, 0, $inX + 16 * $S, $inY + 28 * $S, $winText, $FONT_R, '7070');

/* 4개 국어 이야기는 창 안에 또 넣지 않는다. 왼쪽 "설치 마법사 4개 국어" 알약이
   같은 말을 하고 있고, 창 안에 넣으면 버튼 줄과 겹친다. 여백으로 두는 편이 낫다. */

/* 버튼 3개 (뒤로 / 다음 / 취소) */
$btnY = $winY + $winH - 62 * $S; $btnH = 40 * $S;
$btns = array(array('뒤로', false), array('다음', true), array('취소', false));
$bxr  = $winX + $winW - 30 * $S;
for ($i = count($btns) - 1; $i >= 0; $i--) {
    $label = $btns[$i][0]; $primary = $btns[$i][1];
    $bwid = 118 * $S;
    $bx = $bxr - $bwid;
    if ($primary) {
        rrect($im, $bx, $btnY, $bwid, $btnH, 3 * $S, $brand);
        $lc = $white;
    } else {
        rrect($im, $bx, $btnY, $bwid, $btnH, 3 * $S, $white);
        imagerectangle($im, $bx, $btnY, $bx + $bwid, $btnY + $btnH, $winLine);
        $lc = $winText;
    }
    imagettftext($im, 17 * $S, 0, $bx + ($bwid - tw(17 * $S, $FONT_R, $label)) / 2,
                 $btnY + 27 * $S, $lc, $FONT_R, $label);
    $bxr = $bx - 12 * $S;
}

/* 창 위에 얹는 성공 배지 — "콘솔 창 없음"이 이번 개선의 체감 포인트.
   제목 표시줄 글자를 가리지 않도록 창 위쪽 바깥에 띄운다. */
$okTxt = '콘솔 창 없음';
$okW = tw(16 * $S, $FONT_B, $okTxt) + 34 * $S;
$okY = $winY - 56 * $S;
rrect($im, $winX + $winW - $okW, $okY, $okW, 32 * $S, 4 * $S, $succ);
imagettftext($im, 16 * $S, 0, $winX + $winW - $okW + 17 * $S, $okY + 22 * $S, $white, $FONT_B, $okTxt);

/* ── 하단 모노 라인 (블로그 글 썸네일 표준) ──
   오른쪽 foxnail.kr 과 겹치지 않게 길이를 확인하고, 넘치면 글자를 줄인다. */
$mono = is_file('/usr/share/fonts/redhat-vf/RedHatMono[wght].ttf')
      ? '/usr/share/fonts/redhat-vf/RedHatMono[wght].ttf' : $FONT_R;
$brandTxt = 'foxnail.kr';
$brandW   = tw(20 * $S, $FONT_B, $brandTxt);
$brandX   = $W - $brandW - $PAD;

$line   = 'Inno Setup  ·  Windows x64  ·  Node + JRE bundled  ·  MIT';
$linePt = 20 * $S;
while ($linePt > 12 * $S && $PAD + tw($linePt, $mono, $line) > $brandX - 150) { $linePt -= 2; }
imagettftext($im, $linePt, 0, $PAD, $H - 120, $codefg, $mono, $line);

/* 하단 브랜드 바 */
imagefilledrectangle($im, 0, $H - 12, $W, $H, $brand);
imagettftext($im, 20 * $S, 0, $brandX, $H - 120, $brandL, $FONT_B, $brandTxt);

/* ── 저장 ── */
$tmp = '/tmp/oracle-tuner-installer-og.png';
imagepng($im, $tmp, 6);
imagedestroy($im);
echo "생성: $tmp (" . round(filesize($tmp)/1024) . " KB)\n";

/* ── WP 미디어 등록 + 대표이미지 지정 (재실행 대비 idempotent) ── */
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$IMGKEY = 'ot-installer-og-v1';

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
    $path = get_attached_file($att_id);
    if ($path && copy($tmp, $path)) {
        wp_update_attachment_metadata($att_id, wp_generate_attachment_metadata($att_id, $path));
        echo "첨부 파일 갱신 완료\n";
    }
} else {
    $file = array('name' => 'oracle-tuner-installer-og.png', 'tmp_name' => $tmp);
    $att_id = media_handle_sideload($file, $POST_ID, 'Oracle Tuner 베타 설치판');
    if (is_wp_error($att_id)) { fwrite(STDERR, "sideload 실패: " . $att_id->get_error_message() . "\n"); exit(1); }
    update_post_meta($att_id, '_ot_imgkey', $IMGKEY);
    echo "신규 첨부: $att_id\n";
}

set_post_thumbnail($POST_ID, $att_id);

echo "thumbnail_id : " . get_post_thumbnail_id($POST_ID) . "\n";
echo "image url    : " . wp_get_attachment_url($att_id) . "\n";
echo "post         : " . get_permalink($POST_ID) . "\n";

if (file_exists($tmp)) { @unlink($tmp); }
