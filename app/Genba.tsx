"use client";
// 更新を確かめる：市区町村 → 看板の仕様 → 更新に合わせてすること → 結果。入力は看板の仕様だけ（住所・依頼者・施主の情報は扱わない）。
import { useMemo, useState } from "react";
import D0 from "../lib/data.json";
import { 判定する, 情報の観点 } from "../lib/hantei-core.mjs";

const D = D0 as any;
const 段階の順 = ["注意", "要確認", "問題なさそう"];
const はいいいえ = ["はい", "いいえ", "分からない"];

type 入力 = Record<string, any>;
const 初期: 入力 = {
  市町村: "",
  種類: "壁面",
  表示面積: "分からない",
  高さ4m超: "分からない",
  板面替え: "しない",
  表示者の変更: "ない",
};

function 選ぶ({ 名前, 値, 候補, 変える, 説明 }: { 名前: string; 値: string; 候補: string[]; 変える: (v: string) => void; 説明?: string }) {
  return (
    <fieldset className="choice">
      <legend>{名前}{説明 && <small>{説明}</small>}</legend>
      <div className="chips">
        {候補.map((c) => (
          <button type="button" key={c} className={c === 値 ? "chip on" : "chip"} onClick={() => 変える(c)} aria-pressed={c === 値}>
            {c}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function 段階バッジ({ 段階 }: { 段階: string }) {
  const cls = 段階 === "注意" ? "b-chu" : 段階 === "要確認" ? "b-yo" : "b-ok";
  return <span className={`badge ${cls}`}>{段階}</span>;
}

export default function Genba() {
  const [x, setX] = useState<入力>(初期);
  const set = (k: string) => (v: any) => setX((o) => ({ ...o, [k]: v }));
  const m = x.市町村 ? D.市町村[x.市町村] : null;
  const 窓口: any[] = m?.屋外広告物?.窓口 ?? [];

  const 結果 = useMemo(() => {
    if (!m) return null;
    const 入力 = { ...x, 表示面積: x.表示面積 === "分からない" || x.表示面積 === "" ? "分からない" : Number(x.表示面積) };
    return 判定する(D, 入力);
  }, [x, m]);

  const 並べた = useMemo(() => {
    if (!結果) return [];
    return 結果.結果
      .filter((r: any) => r.判定 !== "該当なし" && !情報の観点.has(r.観点.id))
      .sort((a: any, b: any) => 段階の順.indexOf(a.判定) - 段階の順.indexOf(b.判定));
  }, [結果]);
  const 数 = (s: string) => 並べた.filter((r: any) => r.判定 === s).length;

  const 電話 = useMemo(() => {
    if (!結果 || !m) return "";
    const 行 = [`【${m.名前}】屋外広告物の窓口：${窓口.length ? 窓口.map((w: any) => `${w.課} ${w.電話}`.trim()).join("／") : "未確認"}`];
    行.push("");
    for (const r of 並べた.filter((r: any) => r.判定 !== "問題なさそう")) {
      for (const q of r.電話) 行.push(`□ ${r.観点.表示名}：${q}`);
    }
    return 行.join("\n");
  }, [結果, 並べた, m]);
  const [コピー済み, setコピー済み] = useState(false);
  const コピー = async () => {
    try {
      await navigator.clipboard.writeText(電話);
      setコピー済み(true);
      setTimeout(() => setコピー済み(false), 2000);
    } catch {}
  };

  return (
    <div className="genba">
      <section className="step">
        <h2><span className="n">1</span>看板のある市区町村を選ぶ</h2>
        <select value={x.市町村} onChange={(e) => setX({ ...x, 市町村: e.target.value })} aria-label="市区町村">
          <option value="">— 市区町村 —</option>
          {D.市町村の順.map((n: string) => (
            <option key={n} value={n}>{n}{D.市町村[n].屋外広告物.基準の収録 === "収録" ? "" : "（未収録）"}</option>
          ))}
        </select>
        {m && (
          <div className="zentei">
            <div className="row2">
              <div><span className="k">屋外広告物</span><b>{m.屋外広告物.適用条例}</b>{m.屋外広告物.基準の収録 !== "収録" && <span className="warn">まだ資料を読んでいません（すべて要確認）</span>}</div>
            </div>
            <dl className="madoguchi">
              <dt>更新の窓口</dt>
              <dd>{窓口.length ? 窓口.map((w: any, i: number) => (<div key={i}>{w.課}　{w.電話 && <a href={`tel:${w.電話.replace(/[^\d]/g, "")}`}>{w.電話}</a>}</div>)) : "未確認"}</dd>
            </dl>
          </div>
        )}
      </section>

      {m && (
        <>
          <section className="step">
            <h2><span className="n">2</span>看板の仕様</h2>
            <選ぶ 名前="種類" 値={x.種類} 候補={D.入力.種類} 変える={set("種類")} />
            <fieldset className="choice">
              <legend>表示面積の合計<small>（㎡。空欄＝分からない）</small></legend>
              <input type="number" inputMode="decimal" min="0" step="0.1" value={x.表示面積 === "分からない" ? "" : x.表示面積} onChange={(e) => set("表示面積")(e.target.value === "" ? "分からない" : e.target.value)} placeholder="分からない" aria-label="表示面積の合計（平方メートル）" />
            </fieldset>
            <選ぶ 名前="上端の高さが地上4m超" 値={x.高さ4m超} 候補={はいいいえ} 変える={set("高さ4m超")} />
          </section>

          <section className="step">
            <h2><span className="n">3</span>更新に合わせてすること</h2>
            <選ぶ 名前="板面の交換・デザイン変更" 値={x.板面替え} 候補={D.入力.板面替え} 変える={set("板面替え")} />
            <選ぶ 名前="表示者（設置者）・管理者の変更" 値={x.表示者の変更} 候補={D.入力.表示者の変更} 変える={set("表示者の変更")} />
          </section>

          <section className="step result">
            <h2><span className="n">4</span>この更新で確かめること</h2>
            <p className="summary">
              <段階バッジ 段階="注意" /> {数("注意")}　<段階バッジ 段階="要確認" /> {数("要確認")}　<段階バッジ 段階="問題なさそう" /> {数("問題なさそう")}
            </p>
            <p className="muted small">注意＝資料に決まりがある点／要確認＝資料で決まらない・「分からない」を選んだ点（電話で確認）／問題なさそう＝資料の上では当たらなさそうな点。入力から見て関係しない観点は出していません。</p>
            <ol className="kanten">
              {並べた.map((r: any) => (
                <li key={r.観点.id} className={`k-${r.判定}`}>
                  <div className="head"><段階バッジ 段階={r.判定} /><span className="no">{r.観点.番号}</span><b>{r.観点.表示名}</b></div>
                  <p className="riyu">{r.理由}</p>
                  {r.出典.length > 0 && (
                    <details>
                      <summary>出典（{r.出典.length}）</summary>
                      <ul className="shutten">
                        {r.出典.map((s: any) => s.状態 === "記載なし" ? (
                          <li key={s.id} className="muted">資料に記載なし（{D.記録[s.id]?.探した資料?.map((d: string) => d.replace(/_/g, " ")).join("・")} を読んだ）</li>
                        ) : (
                          <li key={s.id}>
                            <q>{s.引用}</q>
                            <div className="src">
                              <a href={s.url} target="_blank" rel="noreferrer">{s.文書.replace(/_/g, " ")}</a>
                              <span>{s.種別}{s.種別 === "ガイドライン" ? "（推奨）" : ""}・p.{s.ページ}・取得 {s.取得日}</span>
                              {s.OCR && <span className="ocr">画像から読んだ文字（原本と目視済み）</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {r.判定 !== "問題なさそう" && r.電話.length > 0 && (
                    <div className="denwa">☎ {r.電話.map((q: string, i: number) => (<div key={i}>{q}</div>))}</div>
                  )}
                  {r.あるある.length > 0 && (
                    <div className="aruaru">{r.あるある.map((a: any) => (<div key={a.id}>現場のあるある：{a.本文}</div>))}</div>
                  )}
                </li>
              ))}
            </ol>

            <div className="copybox">
              <div className="copyhead"><b>窓口に電話で聞くこと</b><button type="button" onClick={コピー}>{コピー済み ? "コピーしました" : "まとめてコピー"}</button></div>
              <pre>{電話}</pre>
            </div>

            <div className="cta">
              <b>申請書類の作成はクロフネ行政書士事務所へ</b>
              <p>この画面は引っかかる点の目安までです。更新の申請書類づくりは、行政書士にご相談ください。</p>
              <div className="office">
                <div className="oname">クロフネ行政書士事務所</div>
                <div>代表 深沢 文敏（行政書士 登録番号 第14130403号／宅地建物取引士）</div>
                <div>〒330-0802 埼玉県さいたま市大宮区宮町5-28 宝栄第五ビル403</div>
                <div>営業時間 平日 9:00〜17:00（土日祝 定休）</div>
                <div className="links">
                  <a href="tel:0486064733">電話 048-606-4733</a>
                  <a href="https://license.qulofune-office.jp/" target="_blank" rel="noreferrer">license.qulofune-office.jp</a>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
