# お風呂帖 その他ページ 新デザイン化（v2-UI）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予定編集モード・記録一覧・設定の3ページを、記録タブ（v1）と同じ視覚言語に揃えて「見やすく・迷わない」全体体験にする。

**Architecture:** 単一HTML＋React 18＋Babel Standalone（ビルドなし・単体テストランナーなし）。検証はブラウザ確認で行う。既存の行リストCSS（`res-row` 系）・ユニット分け・バッジ・男女色トークンを再利用し、新規CSS/コンポーネントは最小限にする。データモデルは変更しない（v1 で追加した `ユニット`/`皮膚評価要`/`主治医` を利用）。

**Tech Stack:** HTML / React 18 (UMD) / Babel Standalone 7.24.7 / localStorage / Service Worker。対象ファイルは `index.html`（単一ファイル）と `sw.js`。

## Global Constraints

- データ互換（厳守）: 既存項目は削除しない。古いバックアップ（`性別`/`ユニット`/`皮膚評価要` 未設定）を読んでも各ページがクラッシュしない。`normalizeResident` の既定値（`性別:""`, `ユニット:""`, `皮膚評価要:false`）で描画されること。
- 共有デザイントークン（既存・値は厳守）: 男=青 `#9cc0f5`（`.is-male`）／女=紫 `#c3a9ef`（`.is-female`）／未浴・警告=赤 `#d9534f`／皮膚バッジ=`.badge-skin`（`#fff4e5`/`#b26b00`/枠`#f0c98a`）。
- ユニット未設定は「その他」グループに集約し、グループ並びで末尾に置く。
- 機能面の回帰禁止: 予定編集のタップ＝予定トグル、記録一覧の集計・期間切替・Excel出力・印刷、設定の各操作は挙動を変えない（見た目のみ変更）。
- 単体テストランナーは無い。各タスクの検証はブラウザ（`?dev=1` ＋ 開発ツールバーのサンプル投入）で行う。
- リリース時に `sw.js` の `CACHE_NAME` を次版へ更新する（`?cb=N` ではSWキャッシュを破棄できないため）。本計画では `ofurocho-v5` にする。
- スコープ外（今回やらない）: 記録一覧の「氏名列（左列）固定」。3種の表＋グループ見出し行（colSpan）＋印刷と干渉して壊れやすいため見送る。ヘッダー行の上部固定は行う。

---

### Task 1: 共有グループ化ヘルパー ＋ 予定編集モードの行リスト化

記録タブと同じ「ユニット別グループ＋1名1行」に予定編集モードを作り替える。`card-grid`/`EditCard` を廃し、`res-row` 系CSSを再利用する `EditRow` に置換する。並び替え・検索・フィルタ・日付ナビ・印刷は現状維持。

**Files:**
- Modify: `index.html` — `groupByUnit` の直後（現 3425 行の後）に `groupResidentsByUnit` を追加
- Modify: `index.html` — `ResidentRow` の直後（現 3473 行の後）に `EditRow` を追加
- Modify: `index.html` — `EditModeView` の描画部（現 6362-6376 行の `card-grid` ブロック）を置換
- Modify: `index.html` — 行リストCSS群（現 351 行の後）に予定編集用の少量CSSを追加

**Interfaces:**
- Consumes: `EditModeView` 内の `sorted`（要素 `{ resident, planSession, isBathedToday, lastDays, level }`）、`handleTap(residentId)`、`session`（"AM"|"PM"）。
- Produces:
  - `groupResidentsByUnit(rows, getResident) → [{ unit: string, rows: any[] }]`（入力順を保持、"その他" は末尾、他はユニット名の昇順）。Task 2-4 でも使用。
  - `EditRow({ resident, planSession, isBathedToday, lastDays, level, onTap })` — 1行を描画し、行タップで `onTap(resident.id)`。

- [ ] **Step 1: 共有ヘルパー `groupResidentsByUnit` を追加**

`groupByUnit`（現 3405-3425 行）の閉じ `};` の直後に追加する:

```javascript
    // ユニット別にグループ化（入力順を保持。未設定は「その他」で末尾）。
    // getResident: 各要素から resident を取り出す関数。
    const groupResidentsByUnit = (rows, getResident) => {
      const map = new Map();
      rows.forEach((row) => {
        const r = getResident(row);
        const unit = ((r && r.ユニット) || "").trim() || "その他";
        if (!map.has(unit)) map.set(unit, []);
        map.get(unit).push(row);
      });
      const groups = [...map.entries()].map(([unit, list]) => ({ unit, rows: list }));
      groups.sort((a, b) => {
        if (a.unit === "その他") return 1;
        if (b.unit === "その他") return -1;
        return a.unit.localeCompare(b.unit, "ja");
      });
      return groups;
    };
```

- [ ] **Step 2: `EditRow` コンポーネントを追加**

`ResidentRow`（現 3427-3473 行）の閉じ `}` の直後に追加する:

```javascript
    function EditRow({ resident, planSession, isBathedToday, lastDays, level, onTap }) {
      const sexCls = resident.性別 === "男" ? "is-male" : resident.性別 === "女" ? "is-female" : "";
      const isWarn = level === "attention" || level === "critical";
      const rowCls = [
        "res-row", "res-row--edit",
        planSession && "is-planned",
        isWarn && "is-warn",
        sexCls,
      ].filter(Boolean).join(" ");

      const lastLabel = (() => {
        if (lastDays == null) return "未浴";
        if (lastDays === 0) return "本日";
        if (lastDays === 1) return "昨日";
        return `${lastDays}日前`;
      })();

      const lastCls = [
        "res-row-last",
        level === "critical" && "is-critical",
        level === "attention" && "is-attention",
      ].filter(Boolean).join(" ");

      return (
        <div className={rowCls} onClick={() => onTap(resident.id)} role="button" tabIndex={0}
             aria-label={`${resident.名前} ${planSession ? "予定あり" : "予定なし"}`}>
          <span className="res-row-gbar" />
          <span className="res-row-name">{resident.名前}</span>
          {resident.区分 === "短期" && <span className="res-row-short">短期</span>}
          <span className={lastCls}>最終 {lastLabel}</span>
          <span className="res-row-spacer" />
          {resident.皮膚評価要 && <span className="badge-skin">皮膚</span>}
          {planSession === "AM" && <span className="res-row-plan am">午前</span>}
          {planSession === "PM" && <span className="res-row-plan pm">午後</span>}
          {!planSession && isBathedToday && <span className="res-row-plan bathed">本日入浴</span>}
          {!planSession && !isBathedToday && <span className="res-row-plan add">＋予定</span>}
        </div>
      );
    }
```

- [ ] **Step 3: 予定編集用CSSを追加**

行リストCSS群の末尾（`.res-row-skipbtn` の定義、現 351 行）の直後に追加する:

```css
    .res-row.is-warn .res-row-gbar { background: #d9534f; }
    .res-row--edit.is-planned { background: #f6fbf7; }
    .res-row-last { font-size: 12px; color: #64748b; white-space: nowrap; }
    .res-row-last.is-attention { color: #b26b00; }
    .res-row-last.is-critical { color: #b02a1f; font-weight: 600; }
    .res-row-plan { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 3px 10px; margin-right: 8px; white-space: nowrap; }
    .res-row-plan.am { background: #2e9e5b; color: #fff; }
    .res-row-plan.pm { background: #1f7a45; color: #fff; }
    .res-row-plan.bathed { background: #eef1f5; color: #556; }
    .res-row-plan.add { background: #fff; color: #6b7280; border: 1px dashed #cbd5e1; }
```

注: `.res-row.is-warn .res-row-gbar` は既存の `.res-row.is-male/.is-female .res-row-gbar`（現 336-337 行）より後に定義されるため、同一詳細度で警告色が優先される。

- [ ] **Step 4: `EditModeView` の描画を行リストに置換**

`EditModeView` 内の `card-grid` ブロック（現 6362-6376 行）を置換する。置換前:

```javascript
            {sorted.length === 0 ? (
              <EmptyState
                title="該当する利用者がいません"
                body="フィルタや検索を見直してください。"
              />
            ) : (
              <div className="card-grid">
                {sorted.map(item => (
                  <EditCard
                    key={item.resident.id}
                    resident={item.resident}
                    planSession={item.planSession}
                    isBathedToday={item.isBathedToday}
                    lastDays={item.lastDays}
                    level={item.level}
                    onTap={handleTap}
                  />
                ))}
              </div>
            )}
```

置換後:

```javascript
            {sorted.length === 0 ? (
              <EmptyState
                title="該当する利用者がいません"
                body="フィルタや検索を見直してください。"
              />
            ) : (
              <div className="res-list">
                {groupResidentsByUnit(sorted, (x) => x.resident).map(g => {
                  const plannedCount = g.rows.filter(x => x.planSession).length;
                  return (
                    <div className="res-group" key={g.unit}>
                      <div className="res-group-head">
                        <span className="res-group-title">{g.unit}</span>
                        <span className="res-group-count">{plannedCount}名予定</span>
                      </div>
                      <div className="res-group-rows">
                        {g.rows.map(item => (
                          <EditRow
                            key={item.resident.id}
                            resident={item.resident}
                            planSession={item.planSession}
                            isBathedToday={item.isBathedToday}
                            lastDays={item.lastDays}
                            level={item.level}
                            onTap={handleTap}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
```

注: `EditCard` コンポーネント本体（現 6136-6180 行）はこの置換で未使用になる。削除して構わない（`card-grid` のCSS 現 307-322 行は記録タブ以外で使われていないか確認し、他に参照が無ければ残置でも削除でも良い。判断がつかなければ残置する）。

- [ ] **Step 5: ブラウザで確認**

ローカルで `index.html` を開く（`file://` 可）。URL に `?dev=1` を付ける。開発ツールバーの「サンプル投入」→「本日サンプル予定」を実行。記録画面の「予定を編集 →」で予定編集モードに入る。
Expected:
- 利用者がユニット別グループ（すみれ/その他 等）＋1名1行で表示される。
- 各行に男女の色帯・氏名・最終入浴・（該当者のみ）皮膚バッジ・右端に「午前/午後/本日入浴/＋予定」が出る。
- 行タップで当日の枠（AM/PM切替に応じて）の予定が付外しされ、右端表示が「＋予定」⇔「午前(またはPM)」に変わる。
- 並び替え・検索・フィルタ・日付ナビ（←→）・印刷ボタンが従来通り動作。
- コンソールエラー0件。

- [ ] **Step 6: コミット**

```bash
git add index.html
git commit -m "feat: 予定編集モードをユニット別の行リストに刷新"
```

---

### Task 2: 記録一覧（週マトリクス）にユニット別グループ・色ドット・皮膚マーク・ゼブラ

記録一覧の3ビューで共有する小コンポーネントとCSSを確立し、まず `WeekMatrixView` に適用する。表の集計・列・フッター・印刷仕様は変えない。

**Files:**
- Modify: `index.html` — `WeekMatrixView`（現 3979 行）の直前に共有コンポーネント `UnitDot` / `MatrixGroupRow` を追加
- Modify: `index.html` — `WeekMatrixView` の `<tbody>` 描画（現 4062-4096 行）をグループ化に置換、`col-name` セル（現 4071-4074 行）に色ドットと皮膚マークを追加
- Modify: `index.html` — マトリクス表CSS群（現 1035 行 `.matrix-table tfoot td` 付近の後）に共有CSS（色ドット・皮膚マーク・グループ行・ゼブラ・達成表/期間表のヘッダー固定）を追加

**Interfaces:**
- Consumes: Task 1 の `groupResidentsByUnit`。`WeekMatrixView` の `rows`（要素 `{ resident, byDay, total }`）。
- Produces:
  - `UnitDot({ resident })` — 男女色の小丸。Task 3-4 でも使用。
  - `MatrixGroupRow({ unit, colSpan })` — ユニット見出しの `<tr>`。Task 3-4 でも使用。
  - CSSクラス `.unit-dot` / `.skin-mark` / `.matrix-group-row` と、3表共通のゼブラ。Task 3-4 でも使用。

- [ ] **Step 1: 共有コンポーネントを追加**

`WeekMatrixView`（現 3979 行）の直前に追加する:

```javascript
    function UnitDot({ resident }) {
      const cls = resident.性別 === "男" ? "is-male" : resident.性別 === "女" ? "is-female" : "";
      return <span className={`unit-dot ${cls}`} aria-hidden="true" />;
    }

    function MatrixGroupRow({ unit, colSpan }) {
      return (
        <tr className="matrix-group-row">
          <td colSpan={colSpan}>{unit}</td>
        </tr>
      );
    }
```

- [ ] **Step 2: 共有CSSを追加**

`.matrix-table tfoot td { ... }`（現 1035-1041 行あたり）の閉じ `}` の直後に追加する:

```css
    .unit-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%;
      margin-right: 6px; background: #cbd5e1; vertical-align: middle; }
    .unit-dot.is-male { background: #9cc0f5; }
    .unit-dot.is-female { background: #c3a9ef; }
    .skin-mark { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 600;
      color: #b26b00; background: #fff4e5; border: 1px solid #f0c98a; border-radius: 999px;
      padding: 0 6px; vertical-align: middle; }
    .matrix-group-row td { background: #f1f5f9; text-align: left; font-weight: 600;
      color: #374151; font-size: 12px; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    .matrix-table tbody tr:not(.matrix-group-row):nth-of-type(even) > td,
    .achievement-table tbody tr:not(.matrix-group-row):nth-of-type(even) > td,
    .period-grid-table tbody tr:not(.matrix-group-row):nth-of-type(even) > td { background: #fafbfc; }
    .achievement-table thead th,
    .period-grid-table thead th { position: sticky; top: 0; z-index: 2; }
```

注: `.matrix-table thead th` には既に `position: sticky; top: 0`（現 989-996 行）がある。ゼブラは `> td` に background を当て、グループ行（`.matrix-group-row td` の background）が上書きされないようにする。

- [ ] **Step 3: `WeekMatrixView` の `col-name` に色ドットと皮膚マークを追加**

`WeekMatrixView` の `col-name` セル（現 4071-4074 行）を置換する。置換前:

```javascript
                      <td className="col-name">
                        {row.resident.区分 === "短期" && <span className="short-mark">短</span>}
                        {row.resident.名前}
                      </td>
```

置換後:

```javascript
                      <td className="col-name">
                        <UnitDot resident={row.resident} />
                        {row.resident.区分 === "短期" && <span className="short-mark">短</span>}
                        {row.resident.名前}
                        {row.resident.皮膚評価要 && <span className="skin-mark">皮</span>}
                      </td>
```

- [ ] **Step 4: `WeekMatrixView` の `<tbody>` をユニット別グループに置換**

`<tbody>` の中身（現 4063-4096 行）を置換する。置換前は `rows.length === 0 ? (...) : rows.map(row => { ... })`。置換後:

```javascript
                {rows.length === 0 ? (
                  <tr><td colSpan={days.length + 3} className="matrix-empty">該当する利用者がいません</td></tr>
                ) : groupResidentsByUnit(rows, (x) => x.resident).map(g => (
                  <React.Fragment key={g.unit}>
                    <MatrixGroupRow unit={g.unit} colSpan={days.length + 3} />
                    {g.rows.map(row => {
                      const total = row.total;
                      const totalCls = total === 0 ? "warn-critical" : total === 1 ? "warn-attention" : "";
                      return (
                        <tr key={row.resident.id}>
                          <td className="col-room">{row.resident.部屋番号}</td>
                          <td className="col-name">
                            <UnitDot resident={row.resident} />
                            {row.resident.区分 === "短期" && <span className="short-mark">短</span>}
                            {row.resident.名前}
                            {row.resident.皮膚評価要 && <span className="skin-mark">皮</span>}
                          </td>
                          {days.map((d, i) => {
                            const dStr = ymd(d);
                            const cell = row.byDay.get(dStr);
                            const isToday = dStr === todayStr;
                            return (
                              <td key={i} className={`col-day ${isToday ? "is-today" : ""}`}>
                                {cell?.AM && <div className="matrix-bath-badge am">朝</div>}
                                {cell?.PM && <div className="matrix-bath-badge pm">午</div>}
                                {!cell?.AM && !cell?.PM && <span className="matrix-empty">—</span>}
                              </td>
                            );
                          })}
                          <td className="col-day">
                            <span className={`matrix-week-total ${totalCls}`}>
                              {total === 0 && <span className="warn-triangle" />}
                              {total}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
```

注: Step 3 と Step 4 は同じ `col-name` セルを扱う。Step 4 の置換後コードに色ドット・皮膚マークが含まれているため、Step 4 を適用すれば Step 3 の内容も満たされる（順序通り編集すれば重複しない。もし Step 4 を先に適用した場合は Step 3 はスキップしてよい）。

- [ ] **Step 5: ブラウザで確認**

`?dev=1` で開き、「サンプル投入」→「過去60日履歴」を実行。記録一覧タブ →「週」表示。
Expected:
- 表の本体がユニット別（すみれ/その他 等）の見出し行で区切られ、氏名の左に男女の色ドット、必要者に「皮」マークが出る。
- 行が薄いゼブラ、ヘッダー（日付）は縦スクロールしても上部固定。週計・日合計フッター・「今日」列ハイライトは従来通り。
- 検索・短期のみ・警告のみフィルタ、Excel出力、印刷が従来通り。
- コンソールエラー0件。

- [ ] **Step 6: コミット**

```bash
git add index.html
git commit -m "feat: 記録一覧(週)をユニット別グループ・色ドット・皮膚マーク・ゼブラ化"
```

---

### Task 3: 記録一覧（月達成率）に同じパターンを適用

`MonthAchievementView` に Task 2 の共有コンポーネントとグループ化を適用する。達成率バー・サマリ・集計は変えない。

**Files:**
- Modify: `index.html` — `MonthAchievementView` の `<tbody>` 描画（現 4217-4256 行）をグループ化に置換、`col-name` セルに色ドット・皮膚マークを追加

**Interfaces:**
- Consumes: Task 1 の `groupResidentsByUnit`、Task 2 の `UnitDot` / `MatrixGroupRow`。`rows`（要素 `{ resident, level, count, percent, ... }`）。この表の列数は 4（部屋・利用者・入浴回数・達成率）。

- [ ] **Step 1: `<tbody>` をユニット別グループに置換**

`MonthAchievementView` の `<tbody>` 中身（現 4218-4255 行）を置換する。置換後:

```javascript
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="matrix-empty">該当する利用者がいません</td></tr>
                ) : groupResidentsByUnit(rows, (x) => x.resident).map(g => (
                  <React.Fragment key={g.unit}>
                    <MatrixGroupRow unit={g.unit} colSpan={4} />
                    {g.rows.map(row => {
                      const isExcluded = row.level === "excluded";
                      const widthPct = isExcluded ? 0 : Math.min(100, row.percent);
                      return (
                        <tr key={row.resident.id}>
                          <td className="col-room">{row.resident.部屋番号}</td>
                          <td className="col-name">
                            <UnitDot resident={row.resident} />
                            {row.resident.区分 === "短期" && <span className="short-mark">短</span>}
                            {isExcluded && <span className="excluded-mark">除外</span>}
                            {row.resident.名前}
                            {row.resident.皮膚評価要 && <span className="skin-mark">皮</span>}
                          </td>
                          <td className="col-count">{row.count} 回</td>
                          <td className="col-bar">
                            {isExcluded ? (
                              <div className="achievement-bar-row">
                                <span className="achievement-excluded">目標除外{row.resident.目標除外理由 ? `（${row.resident.目標除外理由}）` : ""}</span>
                              </div>
                            ) : (
                              <div className="achievement-bar-row">
                                <div className="achievement-bar-track">
                                  <div
                                    className={`achievement-bar-fill lv-${row.level}`}
                                    style={{ width: `${widthPct}%` }}
                                  />
                                </div>
                                <div className={`achievement-percent lv-${row.level}`}>
                                  {row.level === "good" && <span className="check-mark">✓</span>}
                                  {(row.level === "attention" || row.level === "warn") && <span className="warn-triangle" />}
                                  {row.percent}%
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
```

- [ ] **Step 2: ブラウザで確認**

`?dev=1`＋履歴投入済みの状態で、記録一覧タブ →「月」表示。
Expected: ユニット別見出し・色ドット・「皮」マークが出て、達成率バー・除外表示・月サマリ・未達成のみフィルタが従来通り。ヘッダー固定・ゼブラが効く。コンソールエラー0件。

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "feat: 記録一覧(月達成率)をユニット別グループ・色ドット・皮膚マーク化"
```

---

### Task 4: 記録一覧（半年/年）に同じパターンを適用

`PeriodGridView` に Task 2 の共有コンポーネントとグループ化を適用する。月別％・期間平均・レベル色は変えない。

**Files:**
- Modify: `index.html` — `PeriodGridView` の `<tbody>` 描画（現 4338-4362 行）をグループ化に置換、`col-name` セルに色ドット・皮膚マークを追加

**Interfaces:**
- Consumes: Task 1 の `groupResidentsByUnit`、Task 2 の `UnitDot` / `MatrixGroupRow`。`filtered`（要素 `{ resident, monthly, avg, level }`）。この表の列数は `months.length + 3`（部屋・利用者・各月・期間平均）。

- [ ] **Step 1: `<tbody>` をユニット別グループに置換**

`PeriodGridView` の `<tbody>` 中身（現 4339-4361 行）を置換する。`filtered` を使う点に注意。置換後:

```javascript
                {filtered.length === 0 ? (
                  <tr><td colSpan={months.length + 3} className="matrix-empty">該当する利用者がいません</td></tr>
                ) : groupResidentsByUnit(filtered, (x) => x.resident).map(g => (
                  <React.Fragment key={g.unit}>
                    <MatrixGroupRow unit={g.unit} colSpan={months.length + 3} />
                    {g.rows.map(row => (
                      <tr key={row.resident.id}>
                        <td className="col-room">{row.resident.部屋番号}</td>
                        <td className="col-name">
                          <UnitDot resident={row.resident} />
                          {row.resident.区分 === "短期" && <span className="short-mark">短</span>}
                          {row.level === "excluded" && <span className="excluded-mark">除外</span>}
                          {row.resident.名前}
                          {row.resident.皮膚評価要 && <span className="skin-mark">皮</span>}
                        </td>
                        {row.monthly.map((m, i) => {
                          const isEmpty = m.count === 0;
                          return (
                            <td key={i} className={`col-month lv-${m.level} ${isEmpty && m.level !== "excluded" ? "is-empty" : ""}`}>
                              {m.percent == null ? "—" : `${m.percent}%`}
                            </td>
                          );
                        })}
                        <td className={`col-total lv-${row.level}`}>
                          {row.avg == null ? "—" : `${row.avg}%`}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
```

- [ ] **Step 2: ブラウザで確認**

記録一覧タブ →「半年」→「年」を切替。
Expected: ユニット別見出し・色ドット・「皮」マークが出て、月別％・除外「—」・期間平均・未達成のみフィルタが従来通り。年（12ヶ月）でも横スクロールでき、ヘッダー固定・ゼブラが効く。印刷（半年/年は横向き）が従来通り。コンソールエラー0件。

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "feat: 記録一覧(半年/年)をユニット別グループ・色ドット・皮膚マーク化"
```

---

### Task 5: 設定タブのカード統一

設定タブの「皮膚評価一覧」カードだけが他カードと様式が異なる（未定義の `.data-card-desc` と汎用 `.btn` を使用）。他カードと同じ `data-card-body`／`data-card-action is-primary` に揃える。

**Files:**
- Modify: `index.html` — `SettingsTab` の皮膚評価カード（現 5875-5879 行）

**Interfaces:**
- Consumes: `SettingsTab` の `onOpenSkinPrint`。

- [ ] **Step 1: 皮膚評価カードを共通様式に統一**

`SettingsTab` 内の皮膚評価カード（現 5875-5879 行）を置換する。置換前:

```javascript
          <div className="data-card">
            <h3 className="data-card-title">🩹 皮膚評価一覧（主治医別）</h3>
            <p className="data-card-desc">皮膚評価が必要な利用者を主治医別にまとめて印刷します。</p>
            <button type="button" className="btn btn-primary" onClick={onOpenSkinPrint}>一覧を開く／印刷</button>
          </div>
```

置換後:

```javascript
          <div className="data-card">
            <h3 className="data-card-title">🩹 皮膚評価一覧（主治医別）</h3>
            <p className="data-card-body">皮膚評価が必要な利用者を主治医別にまとめて印刷します。</p>
            <button type="button" className="data-card-action is-primary" onClick={onOpenSkinPrint}>一覧を開く／印刷</button>
          </div>
```

注: これにより未定義だった `.data-card-desc` への依存が無くなり、v1 の Minor 指摘（`.data-card-desc` にCSSが無い）も解消する。新規CSSは不要。

- [ ] **Step 2: ブラウザで確認**

設定タブを開く。
Expected: 皮膚評価カードが他のデータカード（バックアップ等）と同じ見出し・本文・ボタン様式で揃って表示され、「一覧を開く／印刷」で皮膚評価一覧が開く。他カードの操作は従来通り。コンソールエラー0件。

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "feat: 設定タブの皮膚評価カードを共通カード様式に統一"
```

---

### Task 6: SWキャッシュ更新（リリース）

試用端末が古い画面を掴み続けないよう、Service Worker のキャッシュ名を更新する。

**Files:**
- Modify: `sw.js:4`

**Interfaces:**
- なし。

- [ ] **Step 1: `CACHE_NAME` を v5 へ**

`sw.js` の 4 行目を置換する。置換前 `const CACHE_NAME = 'ofurocho-v4';`、置換後:

```javascript
const CACHE_NAME = 'ofurocho-v5';
```

- [ ] **Step 2: ブラウザで確認（互換・回帰の最終確認）**

`?dev=1` で全機能を通しで確認する。
Expected:
- 旧バックアップ（`性別`/`ユニット`/`皮膚評価要` 未設定のJSON）を設定タブ「バックアップから復元」で読み込む → クラッシュせず、予定編集は全員「その他」グループ・帯グレー・皮膚バッジ無し、記録一覧は「その他」見出し・無色ドット・皮膚マーク無しで表示。
- 記録タブ（v1）が影響を受けていない。
- 予定編集／記録一覧（週・月・半年・年）／設定を一通り開いてコンソールエラー0件。

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: SWキャッシュ名をv5に更新（新デザイン反映）"
```

---

## Self-Review

**1. Spec coverage（設計書 §4 との対応）:**
- §4.1 予定編集の行リスト化 → Task 1。
- §4.2 記録一覧の見やすい表（グループ見出し・ヘッダー固定・色ドット・皮膚バッジ・ゼブラ） → Task 2（週・共有確立）＋Task 3（月）＋Task 4（半年/年）。「氏名列（左列）固定」は Global Constraints のスコープ外で明示的に見送り（ヘッダー上部固定は実施）。
- §4.3 設定のカード統一（`.data-card-desc` の扱い） → Task 5（`data-card-body`/`data-card-action` へ統一し `.data-card-desc` 依存を除去）。
- §5 実装注意（DRY・既存クラス共有・回帰防止・SWキャッシュ） → 共有 `groupResidentsByUnit`/`UnitDot`/`MatrixGroupRow`、既存 `res-row`/`badge-skin`/トークン再利用、Task 6 の SW 更新。
- §6 検証（互換・各画面・回帰） → 各タスクの確認ステップ＋Task 6 Step 2。

**2. Placeholder scan:** 「TBD/後で/適宜」等は無し。各コード変更ステップに完全なコードを記載済み。

**3. Type consistency:** `groupResidentsByUnit(rows, getResident) → [{unit, rows}]` を Task 1 で定義し、Task 2-4 で `(x) => x.resident` を渡して同一に使用。`UnitDot({resident})`／`MatrixGroupRow({unit, colSpan})` を Task 2 で定義、Task 3-4 で同一シグネチャで使用。`EditRow` の props は `EditModeView` の `sorted` 要素キー（`resident`/`planSession`/`isBathedToday`/`lastDays`/`level`）と一致。colSpan は各表の実列数（週=`days.length+3`／月=`4`／半年年=`months.length+3`）に一致。
