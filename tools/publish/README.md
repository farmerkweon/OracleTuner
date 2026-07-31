# foxnail.kr 발행 스크립트

블로그 글을 만들고 대표이미지를 붙이는 PHP 스크립트다.
전에는 `dist/` 에 두었는데 그 폴더는 `.gitignore` 대상이라 기록이 남지 않았다. 그래서 여기로 옮겼다.

## 파일

| 파일 | 대상 글 |
|---|---|
| `import-oracle-tuner-beta.php` | 첫 베타 공개 — slug `oracle-tuner-1-0-0-beta` (post 440) |
| `gen-thumb-oracle-tuner.php` | 위 글의 대표이미지 |
| `import-oracle-tuner-installer.php` | 설치판 공개 — slug `oracle-tuner-1-0-0-beta-installer` (post 445) |
| `gen-thumb-oracle-tuner-installer.php` | 위 글의 대표이미지 (attachment 448) |

## 쓰는 법

서버로 올린 뒤 CLI 로 돌린다. 웹에서 실행되지 않는다.

```sh
scp tools/publish/import-oracle-tuner-installer.php art-blog-server:/tmp/
ssh art-blog-server 'php -l /tmp/import-oracle-tuner-installer.php && php /tmp/import-oracle-tuner-installer.php'
```

같은 slug 로 다시 돌리면 새 글이 생기지 않고 기존 글을 고친다(upsert). 대표이미지도
`_ot_imgkey` 로 같은 첨부를 찾아 파일만 갈아 끼운다. 그래서 몇 번을 돌려도 안전하다.

## 지켜야 할 것

- **DB 에 직접 INSERT 하지 않는다.** `wp-load.php` 를 불러 워드프레스 함수만 쓴다.
- 본문 heredoc 은 nowdoc(`<<<'HTML'`) 으로 쓴다. `$` 와 백틱이 그대로 남아야 한다.
- 색은 foxnail 디자인 토큰만 쓴다 (`--brand #2f6bff`, `--night #0f1626` 등).
- 카테고리는 slug 로 찾는다. term ID 를 코드에 박지 않는다.

## ⚠ 워드프레스가 본문을 망가뜨리는 지점

`wpautop` 은 블록 요소를 만나면 감싸고 있던 `<p>` 를 강제로 닫는다.
그래서 **`<a>` 안에 `<div>` 를 넣으면 링크 내용이 링크 밖으로 튕겨 나간다.**
실제로 다운로드 카드가 빈 상자로 렌더링됐다.

```html
<!-- 이렇게 하면 깨진다 -->
<a href="..."><div>설치판</div></a>

<!-- 이렇게 쓴다 -->
<a href="..."><span style="display:block">설치판</span></a>
```

발행한 뒤에는 눈으로 확인한다. 링크가 200 이라고 화면이 멀쩡한 건 아니다.

## 이미지

배포 파일과 화면 이미지는 서버의 아래 경로에 둔다.

```
/var/www/foxnail/wp-content/uploads/download/oracle-tuner/       # exe · zip
/var/www/foxnail/wp-content/uploads/download/oracle-tuner/img/   # 글에 넣는 화면
```
