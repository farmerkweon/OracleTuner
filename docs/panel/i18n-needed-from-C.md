# i18n 키 요청 — Slice C (행 인출 상한/keepRowsMax)

Slice C 는 `web/js/i18n.js` 소유자가 아니므로 직접 넣지 않고 필요한 키만 남깁니다.
현재 `web/js/views/workbench.js` 의 `#result-summary` 표시부(약 273-286행)는 임시로
평문 한글을 그대로 쓰고 있습니다. 아래 키를 추가해 교체해 주세요.

| 제안 키 | ko | en | ja | zh |
|---|---|---|---|---|
| `result.consumedRows` | 소비 {n}행 | Consumed {n} rows | 消費 {n}行 | 消耗 {n}行 |
| `result.keptRows` | 표시 {n}행 | Shown {n} rows | 表示 {n}行 | 显示 {n}行 |
| `result.keepTruncatedNote` | (표시 상한 초과 — 일부만 보관) | (kept-row limit exceeded — partial retained) | (保持上限超過 — 一部のみ保持) | (超出保留上限 — 仅保留部分) |

## 배경
- Java `Exec.fetch()` 가 신규 필드 `consumedRows`, `keptRowCount`, `keepTruncated` 를 응답에 추가했습니다
  (소비 상한 `maxRows` 최대 200만 vs 보관 상한 `keepRowsMax` 기본 5,000 을 분리).
- 상세 설계는 `docs/panel/FIX-SPEC-slice-C-rowlimit.md` 및 `docs/panel/result-C-rowlimit.md` 참고.
