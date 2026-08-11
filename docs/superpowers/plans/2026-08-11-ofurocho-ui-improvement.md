# お風呂帖 UI改善 v1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試行運用（平日午前・約20名）で「とにかく迷わない」入浴管理画面にするため、一覧を行リスト＋ユニット別グループ＋タブレット2列に刷新し、済/取消/未実施フロー・皮膚評価バッジ・主治医別印刷・描画復旧・バックアップ日数バグ修正を実装する。

**Architecture:** 単一HTMLファイル（`index.html`, 6655行）内の React 18 + Babel Standalone アプリを直接編集する。ビルドツール・テストランナーは無い。データは localStorage。新フィールドは `normalizeResident` にデフォルト付きで追加し、古いバックアップと互換を保つ。メインの日次画面 `RecordTab`（6136-6199行）のカードグリッドを、新しい行リスト（`ResidentRow` ＋ ユニット別グループ）に差し替える。

**Tech Stack:** React 18（グローバル `React`/`ReactDOM`）、Babel Standalone（`@7.24.7`、preset `react` のみ）、SheetJS（`XLSX`）、localStorage、Service Worker（PWA）。

## Global Constraints

- 単一ファイル `index.html` を編集。外部JS/ビルド追加は不可。CDNは既存のみ（react@18, react-dom@18, @babel/standalone@7.24.7, xlsx）。
- Babel は `<script type="text/babel" data-presets="react">`（`env` を使わない）。`@babel/standalone` はバージョン固定 `@7.24.7`。
- データ互換ルール（厳守）: 新フィールドは `normalizeResident`/`normalizeBathPlan` に初期値つきで追加。既存フィールドは削除しない。古いバックアップJSONを読んでもクラッシュしない。
- 色トークン（仕様書§4より、正確な値）: 男=帯 `#9cc0f5` / 女=帯 `#c3a9ef` / 未浴=帯 `#d9534f`・バッジ `#fdeceb`(背景)/`#b02a1f`(文字) / 済=`#2e9e5b` / 皮膚=`#fff4e5`(背景)/`#b26b00`(文字)/`#f0c98a`(枠)。
- 状態値は日本語文字列: `"予定"|"済"|"未実施"`。区分は `"通常"|"短期"`。
- pushしない（作業完了まで）。コミットはローカルのみ。`.superpowers/` は既に `.gitignore` 済み。

## テスト方針（このリポジトリ固有）

テストランナーが無いため、各タスクの検証は**ブラウザ実機確認**で行う。手順:

1. リポジトリ直下で静的サーバを起動: `cd "/Users/akazawayoshimi/Desktop/副業関連/ofurocho" && python3 -m http.server 8080`
2. Playwright MCP（`mcp__plugin_playwright_playwright__*`）で `http://localhost:8080/?dev=1&cb=<N>`（`cb` はキャッシュ回避の連番）を開く。
3. 画面右下の DevBar の「サンプル投入」（`handleSeed`）でサンプルデータを投入してから各画面を確認する。
4. 各タスクの「検証」ステップに、コンソールエラー0件＋具体的なDOM/挙動の期待値を記載。確認後にコミット。

純粋ロジック（`normalizeResident` 等）は、ブラウザの devtools コンソールで関数を直接呼んで戻り値を確認する（後述の各タスクに具体コマンドを記載）。

## 確定した前提（ユーザー承認済み 2026-08-11）

- **試行の目的**: 49名＋短期入所者が **週2回**（将来は週3回に切替）入浴できるよう管理する。よって日次画面の主役情報は「今週あと何回必要か／週目標に未達の人は誰か」。
- **性別（`性別`）フィールドの追加**: 仕様書§4は行を男女で色分けするが既存データモデルに性別が無い → resident に `性別`（`"男"|"女"|""`, 初期値 `""`）を追加。Excel「性別」列取り込み＋編集モーダルで入力可、`""` は色帯なし（中立グレー）。
- **週回数インジケータ（②）**: 各行に「今週 N/目標」を表示し、**未達（N<目標）を赤系で強調**。目標は固定値ではなく `個別目標.週 ?? settings.入浴目標.週` を参照（設定で週2⇔週3を切替可能、即時反映）。既存の週集計 `aggregateBathByResident` を使う。
- **既定の入浴目標**: 試行のため `DEFAULTS.settings.入浴目標.週` を **2** にする（設定画面でいつでも変更可）。
- **「N日未浴」バッジ**: モックにある前回入浴日ベースの日数バッジは v1 では出さず、上記「今週 N/目標」で代替する。

---

## Task 1: 描画復旧の確定（Babel固定・preset・SWバージョン）

既に作業ツリーに未コミットの修正（`index.html` のBabel固定＋preset、`sw.js` のキャッシュ名 v3）がある。これを検証してコミットし、以降のタスクが安定して動く土台にする。

**Files:**
- Modify: `index.html:41`（`@babel/standalone` を `@7.24.7` 固定）
- Modify: `index.html:2348`（`data-presets="react"`）
- Modify: `sw.js:4`（`CACHE_NAME = 'ofurocho-v3'`）

**Interfaces:**
- Consumes: なし
- Produces: 正常に描画されるアプリ（後続タスクの前提）。

- [ ] **Step 1: 現状の未コミット差分を確認**

Run: `cd "/Users/akazawayoshimi/Desktop/副業関連/ofurocho" && git diff -- index.html sw.js`
Expected: `index.html` 41行が `https://unpkg.com/@babel/standalone@7.24.7/babel.min.js`、2348行が `data-presets="react"`、`sw.js` 4行が `'ofurocho-v3'` に変わっている。想定と違えばその値に修正する。

- [ ] **Step 2: 静的サーバを起動**

Run: `cd "/Users/akazawayoshimi/Desktop/副業関連/ofurocho" && python3 -m http.server 8080`
（バックグラウンドで起動したまま以降のタスクで使う）

- [ ] **Step 3: ブラウザで描画確認（Playwright MCP）**

`http://localhost:8080/?dev=1&cb=1` を開く。
Expected: 画面が空白でなく、ヘッダー「お風呂帖」とタブが表示される。コンソールに `import statement` エラーや Babel 変換エラーが**0件**。

- [ ] **Step 4: コミット**

```bash
cd "/Users/akazawayoshimi/Desktop/副業関連/ofurocho"
git add index.html sw.js
git commit -m "fix: Babelを7.24.7固定・preset react化・SWキャッシュをv3に更新して描画を復旧"
```

---

## Task 2: resident 新フィールド（性別・ユニット・皮膚評価要・主治医）の追加

データモデルに4フィールドを初期値つきで追加し、Excel取り込みでも読めるようにする。古いバックアップ互換を守る。

**Files:**
- Modify: `index.html` `normalizeResident`（2390-2396行）
- Modify: `index.html` `parseResidentsSheet`（4280-4298行）

**Interfaces:**
- Consumes: なし
- Produces: 全 resident が `性別`(`"男"|"女"|""`)・`ユニット`(string)・`皮膚評価要`(boolean)・`主治医`(string) を必ず持つ。後続の表示/編集/印刷タスクがこれらを参照する。

- [ ] **Step 1: `normalizeResident` にデフォルトを追加**

`index.html` 2390-2396行の `normalizeResident` を次に置き換える:

```javascript
const normalizeResident = (r) => ({
  個別目標: null,
  目標除外: false,
  目標除外理由: "",
  性別: "",
  ユニット: "",
  皮膚評価要: false,
  主治医: "",
  ...r,  // 既存フィールドで上書き
});
```

- [ ] **Step 2: Excel取り込みに新列を追加**

`index.html` 4280-4298行の `parseResidentsSheet` の返却オブジェクトに新フィールドを追加する（`備考` の直後に挿入）:

```javascript
  return rows.map((row, idx) => ({
    id: `r-${String(idx + 1).padStart(3, "0")}`,
    名前: String(row["名前"] || "").trim(),
    フリガナ: String(row["フリガナ"] || "").trim(),
    部屋番号: String(row["部屋番号"] || "").trim(),
    区分: (String(row["区分"] || "通常").trim() === "短期") ? "短期" : "通常",
    入所日: String(row["入所日"] || "").trim() || null,
    在籍中: true,
    備考: String(row["備考"] || "").trim(),
    性別: ((v) => (v === "男" || v === "男性" ? "男" : v === "女" || v === "女性" ? "女" : ""))(String(row["性別"] || "").trim()),
    ユニット: String(row["ユニット"] || row["部屋名"] || "").trim(),
    皮膚評価要: ["1","○","要","true","TRUE","はい"].includes(String(row["皮膚評価"] ?? row["皮膚評価要"] ?? "").trim()),
    主治医: String(row["主治医"] || "").trim(),
  })).filter(r => r.名前);
```

- [ ] **Step 3: 既定の入浴目標を週2回にする**

`index.html` 2381行の `入浴目標: { 週: 3, 最低: 2 },` を次に変更（試行の既定。設定画面で変更可）:

```javascript
        入浴目標: { 週: 2, 最低: 2 },
```

- [ ] **Step 4: 互換ロード確認（コンソール）**

`http://localhost:8080/?dev=1&cb=2` を開き DevBar でサンプル投入。devtools コンソールで:

```javascript
JSON.parse(localStorage.getItem("ofurocho.residents"))
  // 投入直後は新フィールドが無いが…
```
次にページを再読み込み（`normalizeResident` は `loadAll` 時に適用）し、Reactが読んだ値を確認するため、コンソールで:
```javascript
// 旧データ互換の確認: 新フィールドが欠けたオブジェクトを normalize しても落ちない
// （アプリ内関数は非公開のため、ここでは同等ロジックを手動確認）
({個別目標:null,目標除外:false,目標除外理由:"",性別:"",ユニット:"",皮膚評価要:false,主治医:"", ...{id:"x",名前:"旧太郎"}})
```
Expected: `性別:""`, `ユニット:""`, `皮膚評価要:false`, `主治医:""` が入り、`名前:"旧太郎"` が保持される。エラー無し。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "feat: residentに性別・ユニット・皮膚評価要・主治医を初期値つきで追加(Excel取り込み対応)＋既定目標を週2回に"
```

---

## Task 3: 利用者編集モーダルに新フィールドのUIを追加

`ResidentEditModal`（5197-5299行）に、性別・ユニット・皮膚評価要・主治医の入力を追加する。

**Files:**
- Modify: `index.html` `ResidentEditModal`（5197-5299行）

**Interfaces:**
- Consumes: Task 2 の resident 新フィールド。
- Produces: 編集保存時に `性別`/`ユニット`/`皮膚評価要`/`主治医` を含む resident を `onSave` に渡す。

- [ ] **Step 1: state を追加**

`ResidentEditModal` の既存 `useState` 群（`goalMode`,`customWeek`,`excluded`,`excludeReason`）の直後に追加:

```javascript
  const [sex, setSex] = useState(target.性別 || "");
  const [unit, setUnit] = useState(target.ユニット || "");
  const [skinCheck, setSkinCheck] = useState(!!target.皮膚評価要);
  const [doctor, setDoctor] = useState(target.主治医 || "");
```

- [ ] **Step 2: `handleSave` に新フィールドを含める**

`handleSave` 内の `next` を次に置き換える:

```javascript
    const next = {
      ...target,
      個別目標: (goalMode === "custom") ? { 週: Number(customWeek) || 1 } : null,
      目標除外: excluded,
      目標除外理由: excluded ? excludeReason.trim() : "",
      性別: sex,
      ユニット: unit.trim(),
      皮膚評価要: skinCheck,
      主治医: doctor.trim(),
    };
```

- [ ] **Step 3: 入力UIを追加**

`ResidentEditModal` の JSX、個別目標の行（`staff-edit-row`）の**前**に次を挿入:

```javascript
      <div className="staff-edit-row">
        <span className="staff-edit-label">性別</span>
        <div className="staff-edit-radios">
          <label className="staff-edit-radio">
            <input type="radio" checked={sex === "男"} onChange={() => setSex("男")} /> 男
          </label>
          <label className="staff-edit-radio">
            <input type="radio" checked={sex === "女"} onChange={() => setSex("女")} /> 女
          </label>
          <label className="staff-edit-radio">
            <input type="radio" checked={sex === ""} onChange={() => setSex("")} /> 未設定
          </label>
        </div>
      </div>
      <div className="staff-edit-row">
        <span className="staff-edit-label">ユニット</span>
        <input type="text" className="staff-edit-input" placeholder="例：すみれ"
          value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div className="staff-edit-row">
        <span className="staff-edit-label">主治医</span>
        <input type="text" className="staff-edit-input" placeholder="例：田中"
          value={doctor} onChange={(e) => setDoctor(e.target.value)} />
      </div>
      <div className="staff-edit-row">
        <span className="staff-edit-label">皮膚評価</span>
        <label className="staff-edit-radio">
          <input type="checkbox" checked={skinCheck} onChange={(e) => setSkinCheck(e.target.checked)} />
          皮膚評価が必要（一覧にオレンジの「皮膚」バッジを表示）
        </label>
      </div>
```

- [ ] **Step 4: ブラウザで確認**

`?dev=1&cb=3` を開き、サンプル投入 → 設定タブ → 利用者一覧 → いずれかの利用者を編集。性別=女、ユニット=すみれ、主治医=田中、皮膚評価ON にして保存。再度開いて値が保持されていることを確認。
Expected: 保存後に再編集すると入力値が復元される。コンソールエラー0件。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "feat: 利用者編集に性別・ユニット・主治医・皮膚評価の入力を追加"
```

---

## Task 4: バックアップ日数バグ（41666日）の修正

`最終バックアップ` が `null` のとき `hoursElapsed=999999` → `Math.floor(999999/24)=41666` となり「41666日続いています」と表示される。未バックアップ時は日数を出さず適切な文言にする。

**Files:**
- Modify: `index.html` `BackupReminderModal`（3160-3210行）

**Interfaces:**
- Consumes: `lastBackupAt`（ISO文字列 or null/undefined）。
- Produces: 未バックアップ時に異常日数を表示しないモーダル。

- [ ] **Step 1: 未バックアップ分岐を追加**

`BackupReminderModal` 冒頭（3161-3182行あたり）の日数計算とタイトル/サブタイトル生成を次に置き換える:

```javascript
      const hasBackup = !!lastBackupAt;
      const hoursElapsed = hasBackup
        ? (Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60)
        : null;
      const daysElapsed = hoursElapsed != null ? Math.floor(hoursElapsed / 24) : null;
      const isCritical = !hasBackup || daysElapsed >= 3;

      const title = !hasBackup
        ? "⚠ まだ一度もバックアップしていません"
        : isCritical
        ? `⚠ バックアップ未実施が${daysElapsed}日続いています`
        : "バックアップのお願い";

      const subtitle = !hasBackup
        ? "データを守るため、今すぐバックアップしてください"
        : daysElapsed > 0
        ? `前回のバックアップから ${daysElapsed}日 経過しています`
        : "前回のバックアップから24時間以上経過しています";

      const lastLabel = hasBackup
        ? new Date(lastBackupAt).toLocaleString("ja-JP")
        : "未実施（このアプリでは一度もバックアップが取られていません）";
```

そして JSX 側の `subtitle={daysElapsed > 0 ? ... : ...}` を `subtitle={subtitle}` に置き換える（3181行）。

- [ ] **Step 2: ブラウザで確認**

`?dev=1&cb=4` を開き、サンプル投入（最終バックアップは null のまま）。バックアップ催促モーダルが出る条件（データあり・24h超）を満たすため、コンソールで最終バックアップを未設定のまま強制表示するには、DevBar 経由か、`data.residents.length>0` 状態でリロード。
Expected: モーダルのタイトルが「⚠ まだ一度もバックアップしていません」となり、「41666日」が**表示されない**。コンソールエラー0件。

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "fix: 未バックアップ時に41666日と誤表示する不具合を修正"
```

---

## Task 5: メイン日次画面を「ユニット別グループ＋行リスト」に刷新

`RecordTab`（6136-6199行）のカードグリッドを、ユニット別グループの行リストに差し替える。新コンポーネント `ResidentRow` と グループ化ヘルパ `groupByUnit` を追加し、CSSを追加する。男女帯・未浴・済・皮膚バッジの視覚言語を実装する。

**Files:**
- Modify: `index.html` `RecordTab`（6136-6199行、`card-grid` 部分）
- Create（同ファイル内・`ResidentCard` 3274-3330行の直後に追加）: `ResidentRow` コンポーネント、`groupByUnit` ヘルパ
- Modify: `index.html` CSS（`.card-grid` 付近 307-322行の近くに行リスト用CSSを追加）

**Interfaces:**
- Consumes: Task 2/3 の resident 新フィールド。`selectTodayPlans`（2719行）が返す `{plan, resident}` 配列。`onTogglePlan`（済にする）、`onOpenMenu`（未実施メニュー）。
- Produces:
  - `groupByUnit(items) -> Array<{unit: string, rows: Array<{plan, resident}>, doneCount: number, total: number}>`（ユニット名昇順、未設定は「その他」を最後）。
  - `ResidentRow({ resident, plan, weekCount, goal, onToggle, onOpenMenu })` — 1名1行を描画。`weekCount`=今週の入浴済回数、`goal`=週目標回数。`weekCount < goal` を赤系で強調。

- [ ] **Step 1: グループ化ヘルパ `groupByUnit` を追加**

`ResidentCard`（3330行の閉じ）の直後に追加:

```javascript
    const groupByUnit = (items) => {
      const map = new Map();
      items.forEach(({ plan, resident }) => {
        const unit = (resident.ユニット || "").trim() || "その他";
        if (!map.has(unit)) map.set(unit, []);
        map.get(unit).push({ plan, resident });
      });
      const groups = [...map.entries()].map(([unit, rows]) => ({
        unit,
        rows: rows.slice().sort((a, b) =>
          (a.resident.部屋番号 || "").localeCompare(b.resident.部屋番号 || "", "ja", { numeric: true })),
        doneCount: rows.filter(r => r.plan.状態 === "済").length,
        total: rows.length,
      }));
      groups.sort((a, b) => {
        if (a.unit === "その他") return 1;
        if (b.unit === "その他") return -1;
        return a.unit.localeCompare(b.unit, "ja");
      });
      return groups;
    };
```

- [ ] **Step 2: `ResidentRow` コンポーネントを追加**

`groupByUnit` の直後に追加:

```javascript
    function ResidentRow({ resident, plan, weekCount, goal, onToggle, onOpenMenu }) {
      const isDone = plan.状態 === "済";
      const isUnimplemented = plan.状態 === "未実施";
      const sexCls = resident.性別 === "男" ? "is-male" : resident.性別 === "女" ? "is-female" : "";
      const behind = goal > 0 && weekCount < goal; // 週目標に未達

      const rowCls = [
        "res-row",
        isDone && "is-done",
        isUnimplemented && "is-skip",
        (!isDone && !isUnimplemented) && sexCls,
      ].filter(Boolean).join(" ");

      const handleRowClick = () => {
        if (isDone || isUnimplemented) return; // 戻すのは「取消」ボタンだけ（誤操作防止）
        onToggle(plan.id);
      };

      return (
        <div className={rowCls} onClick={handleRowClick} role="button" tabIndex={0}
             aria-label={`${resident.名前} ${isDone ? "済" : isUnimplemented ? "未実施" : "予定"}`}>
          <span className="res-row-gbar" />
          <span className="res-row-name">{resident.名前}</span>
          {resident.区分 === "短期" && <span className="res-row-short">短期</span>}
          <span className="res-row-time">
            {isDone && plan.記録時刻 ? new Date(plan.記録時刻).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          <span className="res-row-spacer" />
          <span className={`res-row-week${behind ? " is-behind" : ""}`}>今週 {weekCount}/{goal}</span>
          {resident.皮膚評価要 && <span className="badge-skin">皮膚</span>}
          {isUnimplemented && (
            <span className="res-row-skiptag">
              未実施・{plan.未実施理由 === "その他" && plan.メモ ? plan.メモ : (plan.未実施理由 || "")}
            </span>
          )}
          {isDone && <span className="chk-done">✓ 済</span>}
          {(isDone || isUnimplemented) && (
            <button type="button" className="res-row-undo"
              onClick={(e) => { e.stopPropagation(); onToggle(plan.id); }}>取消</button>
          )}
          {(!isDone && !isUnimplemented) && (
            <button type="button" className="res-row-skipbtn"
              onClick={(e) => { e.stopPropagation(); onOpenMenu(); }}>未実施</button>
          )}
        </div>
      );
    }
```

注: 「取消」は `onToggle(plan.id)` を呼ぶ（`togglePlanStatus` は 済→予定 / 未実施→予定 に戻すため）。行本体クリックでは戻さない。

- [ ] **Step 3a: `RecordTab` に今週の入浴回数集計を追加**

`RecordTab`（6136-6199行）の冒頭、`const dateStr = ymd(today);` の直後に、今週の週目標と入浴回数マップを計算する `useMemo` を追加する:

```javascript
      const weekAgg = useMemo(() => {
        const ws = startOfWeek(today);
        const days = weekDays(ws);
        return aggregateBathByResident(data.bathPlans, ymd(days[0]), ymd(days[days.length - 1]));
      }, [data.bathPlans, today]);
      const defaultGoal = data.settings.入浴目標.週 || 2;
      const goalFor = (r) => (r.個別目標 && r.個別目標.週) ? r.個別目標.週 : defaultGoal;
      const weekCountFor = (r) => (weekAgg.get(r.id) || []).length;
```

- [ ] **Step 3b: `RecordTab` の描画を行リストに差し替え**

`RecordTab`（6136-6199行）内の `<div className="card-grid"> ... </div>` ブロック全体を次に置き換える:

```javascript
          <div className="res-list">
            {groupByUnit(items).map(g => (
              <div className="res-group" key={g.unit}>
                <div className="res-group-head">
                  <span className="res-group-title">{g.unit}</span>
                  <span className="res-group-count">{g.doneCount} / {g.total} 済</span>
                  <span className="res-group-bar"><i style={{ width: `${g.total ? Math.round(g.doneCount / g.total * 100) : 0}%` }} /></span>
                </div>
                <div className="res-group-rows">
                  {g.rows.map(({ plan, resident }) => (
                    <ResidentRow
                      key={plan.id}
                      resident={resident}
                      plan={plan}
                      weekCount={weekCountFor(resident)}
                      goal={goalFor(resident)}
                      onToggle={onTogglePlan}
                      onOpenMenu={() => onOpenMenu({ plan, resident })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
```

注: `startOfWeek`/`weekDays`/`aggregateBathByResident`/`ymd` はいずれもモジュール上部（2932/2964/3006行）で定義済みで、同スコープから参照できる。

- [ ] **Step 4: 行リストCSSを追加**

`index.html` の `.card-grid` 定義（307-322行付近）の直後に追加:

```css
.res-list { display: flex; flex-direction: column; gap: 16px; }
.res-group-head { display: flex; align-items: center; gap: 10px; margin: 4px 0 6px; }
.res-group-title { font-size: 14px; font-weight: 600; color: #374151; border-left: 4px solid #64748b; padding-left: 8px; }
.res-group-count { font-size: 12px; color: #64748b; white-space: nowrap; }
.res-group-bar { flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; max-width: 200px; }
.res-group-bar > i { display: block; height: 100%; background: #2e9e5b; }
.res-group-rows { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #fff; }

.res-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 0;
  border-bottom: 1px solid #f1f5f9; position: relative; cursor: pointer; min-height: 44px; }
.res-row:last-child { border-bottom: none; }
.res-row-gbar { width: 7px; align-self: stretch; background: #cbd5e1; border-radius: 0 3px 3px 0; }
.res-row.is-male .res-row-gbar { background: #9cc0f5; }
.res-row.is-female .res-row-gbar { background: #c3a9ef; }
.res-row-name { font-size: 19px; font-weight: 600; color: #1f2937; min-width: 112px; }
.res-row-short { font-size: 11px; color: #7a5; border: 1px solid #cbe0c0; border-radius: 999px; padding: 1px 7px; }
.res-row-time { font-size: 12px; color: #8a8a8a; }
.res-row-spacer { flex: 1; }
.res-row-skiptag { font-size: 11px; background: #eef1f5; color: #556; padding: 3px 9px; border-radius: 999px; }
.res-row-week { font-size: 12px; color: #475569; background: #eef2f7; border-radius: 999px; padding: 3px 9px; font-weight: 600; white-space: nowrap; }
.res-row-week.is-behind { color: #b02a1f; background: #fdeceb; }
.res-row.is-done { background: #f6fbf7; }
.res-row.is-skip { background: #fafafa; }
.res-row.is-skip .res-row-gbar { background: #cbd5e1; }
.chk-done { background: #2e9e5b; color: #fff; font-size: 12px; padding: 3px 10px; border-radius: 999px; font-weight: 600; }
.badge-skin { background: #fff4e5; color: #b26b00; border: 1px solid #f0c98a; font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
.res-row-undo { font-size: 11px; color: #2e9e5b; text-decoration: underline; background: none; border: none; cursor: pointer; margin-right: 8px; }
.res-row-skipbtn { font-size: 11px; color: #6b7280; background: #fff; border: 1px solid #cbd5e1; border-radius: 999px; padding: 3px 10px; cursor: pointer; margin-right: 8px; }
```

- [ ] **Step 5: ブラウザで確認**

`?dev=1&cb=5` を開きサンプル投入。編集タブでサンプル利用者に `性別`/`ユニット` を数名分入力（またはExcel取り込み）。入浴記録タブを開く。
Expected: 利用者がユニット別グループで縦の行リスト表示になる。各グループ見出しに「N / M 済」＋バー。男=青帯/女=紫帯/未設定=グレー帯。各行に「今週 N/2」が出て、未達の人は赤系で強調。行タップで「✓ 済」＋緑背景になり、「取消」ボタンが出る（このとき今週回数が+1される）。皮膚評価ONの人にオレンジ「皮膚」バッジ。コンソールエラー0件。

- [ ] **Step 6: コミット**

```bash
git add index.html
git commit -m "feat: 入浴記録画面をユニット別グループの行リストに刷新(男女帯・済・皮膚バッジ)"
```

---

## Task 6: タブレット横向きで自動2列にする

Task 5 の行リストを、広い画面幅（横向き想定）で2列に自動展開する。狭い画面では1列に戻る。

**Files:**
- Modify: `index.html` CSS（Task 5 で追加した行リストCSSの直後）

**Interfaces:**
- Consumes: Task 5 の `.res-group-rows` / `.res-row` 構造。
- Produces: レスポンシブ2列表示。

- [ ] **Step 1: 2列レイアウトCSSを追加**

Task 5 のCSSブロック直後に追加（幅900px以上で2列）:

```css
@media (min-width: 900px) {
  .res-group-rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 0;
  }
  .res-group-rows > .res-row:nth-child(odd):not(:last-child) { border-right: 1px solid #f1f5f9; }
}
```

- [ ] **Step 2: ブラウザで確認（広幅）**

Playwright でビューポートを 1280×800 にリサイズして `?dev=1&cb=6` を開く。
Expected: 各ユニットの行が2列に並ぶ。ビューポートを 700 幅にすると1列に戻る。行の中身（帯・名前・バッジ・ボタン）が崩れない。コンソールエラー0件。

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "feat: 広い画面幅(タブレット横向き)で行リストを自動2列表示"
```

---

## Task 7: 未実施フローの調整（理由順・「時間が足りなかった」先頭）

未実施理由の選択肢を仕様書の順（先頭＝「時間が足りなかった」）に変更し、既定値も合わせる。行リスト側の未実施ボタン/取消は Task 5 で実装済み。

**Files:**
- Modify: `index.html` `UNIMPLEMENTED_REASONS`（2769行）
- Modify: `index.html` `UnimplementedModal` の既定 reason（3334・3341・3345行付近の `"時間切れ"`）

**Interfaces:**
- Consumes: `markPlanUnimplemented(bathPlans, planId, reason, memo)`（2754行、変更不要）。
- Produces: 「時間が足りなかった」を先頭・既定とする理由リスト。

- [ ] **Step 1: 理由リストを差し替え**

`index.html` 2769行の定義を次に置き換える:

```javascript
const UNIMPLEMENTED_REASONS = ["時間が足りなかった", "本人の希望で見送り", "体調不良", "受診・外出", "拒否", "その他"];
```

- [ ] **Step 2: 既定 reason を差し替え**

`UnimplementedModal`（3332-3396行）内の `"時間切れ"` 3箇所（`useState("時間切れ")`、`setReason(target.plan.未実施理由 || "時間切れ")`、else 節の `setReason("時間切れ")`）をすべて `"時間が足りなかった"` に置き換える。

- [ ] **Step 3: ブラウザで確認**

`?dev=1&cb=7` を開きサンプル投入 → 入浴記録タブ → 予定の行の「未実施」ボタンを押す。
Expected: モーダルの理由リスト先頭が「時間が足りなかった」で選択済み。保存すると行がグレーになり「未実施・時間が足りなかった」と表示。「取消」で予定に戻る。コンソールエラー0件。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "feat: 未実施理由の先頭・既定を「時間が足りなかった」に変更"
```

---

## Task 8: 皮膚評価一覧（主治医別）＋印刷

「皮膚評価が必要」な在籍利用者を主治医名でグループ化した印刷用一覧画面と、印刷ボタン、印刷CSSを追加する。設定タブから開く導線を付ける。

**Files:**
- Create（`index.html` 内、`AboutSection` 5553行付近の前など設定系コンポーネント群の近く）: `SkinAssessmentPrintView` コンポーネント
- Modify: `index.html` `SettingsTab`（5590-5632行）に開くボタンを追加、App にモーダル/ビュー表示state を追加（6234行〜）
- Modify: `index.html` 印刷CSS（2044-2340行の印刷スタイル内）

**Interfaces:**
- Consumes: resident の `皮膚評価要`/`主治医`/`ユニット`/`名前`/`区分`。`data.residents`。
- Produces: `SkinAssessmentPrintView({ residents, onClose })` — 主治医別の表を描画し `window.print()` で印刷。

- [ ] **Step 1: `SkinAssessmentPrintView` を追加**

`AboutSection`（5553行）の直前に追加:

```javascript
    function SkinAssessmentPrintView({ residents, onClose }) {
      const targets = residents.filter(r => r.在籍中 && r.皮膚評価要);
      const byDoctor = new Map();
      targets.forEach(r => {
        const d = (r.主治医 || "").trim() || "（主治医未設定）";
        if (!byDoctor.has(d)) byDoctor.set(d, []);
        byDoctor.get(d).push(r);
      });
      const doctors = [...byDoctor.entries()]
        .map(([doctor, list]) => ({
          doctor,
          list: list.slice().sort((a, b) =>
            (a.部屋番号 || "").localeCompare(b.部屋番号 || "", "ja", { numeric: true })),
        }))
        .sort((a, b) => a.doctor.localeCompare(b.doctor, "ja"));

      return (
        <div className="skin-print-overlay">
          <div className="skin-print-toolbar no-print">
            <button type="button" className="btn btn-ghost" onClick={onClose}>閉じる</button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>🖨 印刷</button>
          </div>
          <div className="skin-print-sheet">
            <div className="skin-print-head">
              <div className="skin-print-title">皮膚評価一覧</div>
              <div className="skin-print-meta">作成日 {new Date().toLocaleDateString("ja-JP")}　対象 {targets.length}名</div>
            </div>
            {doctors.length === 0 ? (
              <p className="skin-print-empty">「皮膚評価が必要」に設定された利用者がいません。</p>
            ) : doctors.map(({ doctor, list }) => (
              <div className="skin-print-doc" key={doctor}>
                <div className="skin-print-docname">主治医：{doctor}</div>
                <table className="skin-print-table">
                  <thead>
                    <tr><th>部屋</th><th>氏名</th><th>所見（記入欄）</th></tr>
                  </thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.id}>
                        <td>{r.ユニット || r.部屋番号}</td>
                        <td className="skin-print-name">{r.名前}</td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      );
    }
```

- [ ] **Step 2: App に表示state と描画を追加**

`App`（6234行〜）の state 群に追加:

```javascript
  const [skinPrintOpen, setSkinPrintOpen] = useState(false);
```

`App` の通常モード return 内、モーダル群（`<StaffEditModal ... />` の付近）に追加:

```javascript
      {skinPrintOpen && (
        <SkinAssessmentPrintView
          residents={data.residents}
          onClose={() => setSkinPrintOpen(false)}
        />
      )}
```

- [ ] **Step 3: 設定タブに開くボタンを追加**

`SettingsTab`（5590-5632行）は props で `onOpenSkinPrint` を受け取り、利用者セクション付近にボタンを置く。まず `SettingsTab` の引数に `onOpenSkinPrint` を追加し、JSX に:

```javascript
          <div className="data-card">
            <h3 className="data-card-title">🩹 皮膚評価一覧（主治医別）</h3>
            <p className="data-card-desc">皮膚評価が必要な利用者を主治医別にまとめて印刷します。</p>
            <button type="button" className="btn btn-primary" onClick={onOpenSkinPrint}>一覧を開く／印刷</button>
          </div>
```

そして App が `SettingsTab` を描画している箇所（`renderTab` 内）に `onOpenSkinPrint={() => setSkinPrintOpen(true)}` を渡す。

- [ ] **Step 4: 画面・印刷CSSを追加**

印刷スタイル領域（2044-2340行）に追加:

```css
.skin-print-overlay { position: fixed; inset: 0; background: #f6f7f9; overflow: auto; z-index: 4000; padding: 16px; }
.skin-print-toolbar { display: flex; justify-content: flex-end; gap: 10px; max-width: 720px; margin: 0 auto 12px; }
.skin-print-sheet { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px 22px; max-width: 720px; margin: 0 auto; color: #1f2937; }
.skin-print-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #374151; padding-bottom: 8px; margin-bottom: 14px; }
.skin-print-title { font-size: 18px; font-weight: 700; }
.skin-print-meta { font-size: 12px; color: #64748b; }
.skin-print-doc { margin-bottom: 18px; }
.skin-print-docname { font-size: 15px; font-weight: 700; color: #374151; background: #f1f5f9; border-left: 5px solid #64748b; padding: 6px 10px; border-radius: 4px; margin-bottom: 6px; }
.skin-print-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.skin-print-table th, .skin-print-table td { border: 1px solid #d7dbe0; padding: 8px 9px; text-align: left; }
.skin-print-table th { background: #f8fafc; color: #475569; font-weight: 600; font-size: 12px; }
.skin-print-table td { height: 30px; }
.skin-print-name { font-weight: 600; font-size: 15px; }
.skin-print-empty { color: #64748b; }
@media print {
  .app, .no-print { display: none !important; }
  .skin-print-overlay { position: static; padding: 0; background: #fff; }
  .skin-print-sheet { border: none; max-width: none; }
}
```

注: 既存の印刷CSS（2044-2340行）が `.app` をどう扱うか確認し、競合すれば `.skin-print-overlay` 表示時のみ他を隠すよう `@media print` を調整する。

- [ ] **Step 5: ブラウザで確認**

`?dev=1&cb=8` を開きサンプル投入 → 数名に主治医（例：田中／山田）と皮膚評価ONを設定 → 設定タブ →「皮膚評価一覧」を開く。
Expected: 主治医別に区切られた表（列：部屋・氏名・所見空欄）が表示。「印刷」で印刷プレビューが出て、ツールバーやアプリ本体が印刷に含まれない。コンソールエラー0件。

- [ ] **Step 6: コミット**

```bash
git add index.html
git commit -m "feat: 皮膚評価一覧(主治医別)の画面と印刷を追加"
```

---

## Task 9: 最終確認（互換・全画面の回帰）

全機能を通しで確認し、旧バックアップ互換とレイアウト回帰が無いことを確かめる。

**Files:**
- なし（確認のみ）

- [ ] **Step 1: 旧バックアップ互換の確認**

新フィールドを持たない旧JSON（`residents` に `性別`/`ユニット`/`皮膚評価要`/`主治医` が無いオブジェクト）を用意し、設定タブの「バックアップから復元」で読み込む。
Expected: クラッシュせず読み込め、行リストは全員「その他」グループ・帯グレー・皮膚バッジ無しで表示される。

- [ ] **Step 2: 主要画面の回帰確認**

入浴記録（AM/PM切替）／記録一覧タブ／設定タブ／予定編集モード／各Excel出力ボタンを一通り開く。
Expected: いずれもコンソールエラー0件、レイアウト崩れ無し。

- [ ] **Step 3: 確認完了（コミット不要）**

問題があれば該当タスクに戻って修正・再コミット。

---

## Self-Review 結果

- **Spec coverage:** §2の9項目 → Task1(描画復旧), Task4(41666バグ), Task5(一覧刷新), Task5(ユニット別グループ), Task5+7(操作フロー), Task5(見た目), Task5(皮膚バッジ), Task8(主治医別印刷), 既存Excel/JSON機能は現状維持+Task9で互換確認。§3のデータモデル→Task2/3。§4レイアウト→Task5/6。§5フロー→Task5/7。§6皮膚→Task3/5/8。§7バグ→Task1/4。
- **Gap（解決済み）:** 仕様書§4の男女色分けに必要な `性別` フィールドが元仕様§3に無い → Task2で追加（ユーザー承認済み）。
- **週回数インジケータ（②・ユーザー承認済み）:** 試行目的「週2回入浴」に合わせ、各行に「今週 N/目標」を表示し未達を強調（Task5）。目標は `個別目標.週 ?? settings.入浴目標.週` を参照し、週2⇔週3の切替は設定変更で即時反映。既定目標は週2（Task2 Step3）。「N日未浴」バッジはこれで代替し v1 では出さない。
