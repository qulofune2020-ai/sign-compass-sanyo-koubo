"use client";
// 市町村を比べる：観点を1つ選ぶと、収録済みの自治体の記録が横に並ぶ。
import { useState } from "react";
import D0 from "../../lib/data.json";

const D = D0 as any;
// 収録済みの自治体（記録のある自治体）を、都道府県の条例 → 市の独自条例 の順に並べる
const 収録の名前 = [...new Set(Object.keys(D.記録).map((id: string) => id.split("-")[0]))] as string[];
const 自治体 = 収録の名前.sort().map((n) => ({ 名前: n, 接頭: n, 注: /[都道府県]$/.test(n) ? "都道府県の条例（市町村に共通）" : "市区町村の独自条例" }));

export default function Hikaku() {
  const [k, setK] = useState<string>("点検報告");
  const 観点 = D.観点.find((x: any) => x.id === k);
  const 記録 = Object.values(D.記録 as Record<string, any>);
  return (
    <div className="hikaku">
      <h1>市区町村を比べる</h1>
      <p className="muted small">観点を選ぶと、収録済みの自治体の資料の記述が並びます。</p>
      <select value={k} onChange={(e) => setK(e.target.value)} aria-label="観点">
        {["入口", "更新", "一緒に起きること"].map((g) => (
          <optgroup key={g} label={g}>
            {D.観点.filter((x: any) => x.群 === g).map((x: any) => (
              <option key={x.id} value={x.id}>{x.番号} {x.表示名}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="small">資料で探すもの：{観点.資料で探すもの}</p>
      <div className="cols">
        {自治体.map((j) => {
          const rs = 記録.filter((r) => r.id.startsWith(`${j.接頭}-`) && r.観点 === k);
          return (
            <section key={j.名前} className="col">
              <h2>{j.名前}<small>{j.注}</small></h2>
              {rs.length === 0 && <p className="muted">記録なし（要確認）</p>}
              {rs.map((r) => {
                const s = D.資料[r.文書];
                const url = (s?.形式 === "pdf" || /\.pdf$/i.test(s?.url ?? "")) ? `${s.url}#page=${r.ページ}` : s?.url;
                return (
                  <div key={r.id} className={r.状態 === "記載なし" ? "rec nashi" : "rec"}>
                    {r.地域区分 && <span className="tag">{r.地域区分}</span>}
                    {r.状態 === "記載なし" && <span className="tag">記載なし</span>}
                    <p>{r.要約}</p>
                    {r.引用 && (
                      <div className="src">
                        <q>{r.引用}</q>
                        <a href={url} target="_blank" rel="noreferrer">{r.文書.replace(/_/g, " ")} p.{r.ページ}</a>
                        <span className="muted">（{r.種別}{r.種別 === "ガイドライン" ? "・推奨" : ""}・取得 {r.取得日}）</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <p className="small">窓口に電話で聞く文：{観点.電話で聞く文}</p>
    </div>
  );
}
