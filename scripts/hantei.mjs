// 判定のエンジン（更新版）：入力（市町村・看板の仕様・更新に合わせてすること）→ 観点ごとの3段階・理由・出典・電話で聞くこと。
// ルールは data/判定.yaml。判定の順番は判定.yaml の頭に書いたとおり。画面（app/）も同じ関数を使う。
// npm run 判定 で lib/data.json を書き、典型ケースの表を docs/判定_典型ケース.md に書く。
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { 判定する, ルールを点検 } from "../lib/hantei-core.mjs";
export { 判定する, ルールを点検 };

const ROOT = path.resolve(import.meta.dirname, "..");
const 読む = (f) => parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

export function データを読む() {
  const 記録 = {};
  for (const f of fs.readdirSync(path.join(ROOT, "data/基準")).filter((f) => f.endsWith(".yaml"))) {
    for (const r of 読む(`data/基準/${f}`).記録 ?? []) 記録[r.id] = r;
  }
  const 取得 = Object.fromEntries((読む("data/取得記録.yaml").取得 ?? []).map((r) => [r.id, r]));
  const 市 = 読む("data/市町村.yaml").市町村;
  return {
    観点: 読む("data/観点.yaml").観点,
    判定: 読む("data/判定.yaml").判定,
    入力: 読む("data/判定.yaml").入力,
    市町村: Object.fromEntries(市.map((m) => [m.名前, m])),
    市町村の順: 市.map((m) => m.名前),
    資料: Object.fromEntries((読む("data/資料.yaml").資料 ?? []).map((r) => [r.id, { ...r, 取得日: 取得[r.id]?.取得日 ?? null, 取れた: 取得[r.id]?.状態 !== "取れない" }])),
    記録,
    電話: 読む("data/電話で聞くこと.yaml").聞くこと ?? [],
    あるある: 読む("data/あるある.yaml").あるある ?? [],
  };
}

// 典型ケース：収録済みの市区町村から自動で作る（架空の看板）
const 既定 = { 種類: "壁面", 表示面積: 8, 高さ4m超: "いいえ", 板面替え: "しない", 表示者の変更: "ない" };
const 重い = { 種類: "自立", 表示面積: 12, 高さ4m超: "はい", 板面替え: "店名・ロゴも替える", 表示者の変更: "ある" };
export function ケースを作る(D) {
  const 収録 = D.市町村の順.filter((n) => D.市町村[n].屋外広告物.基準の収録 === "収録").slice(0, 4);
  const cs = 収録.map((n, i) => ({ 名前: `${i + 1} ${n}（${i % 2 ? "自立・4m超・店名替え・表示者変更" : "壁面・8㎡・そのまま更新"}）`, 入力: { ...既定, ...(i % 2 ? 重い : {}), 市町村: n } }));
  const 未 = D.市町村の順.find((n) => D.市町村[n].屋外広告物.基準の収録 !== "収録");
  if (未) cs.push({ 名前: `${cs.length + 1} 未収録の例（${未}）`, 入力: { ...既定, 市町村: 未 } });
  return cs;
}

function main() {
  const D = データを読む();
  fs.writeFileSync(path.join(ROOT, "lib", "data.json"), JSON.stringify(D));
  const 問題 = ルールを点検(D);
  const ケース = ケースを作る(D);
  const 行 = ["# 判定の典型ケース（npm run 判定 が書く）", "", "架空の看板。表の記号：要＝要確認、注＝注意、◯＝問題なさそう、－＝該当なし（画面に出さない）。", ""];
  const 全 = ケース.map((c) => ({ c, r: 判定する(D, c.入力) }));
  for (const { c, r } of 全) {
    const 数 = (s) => r.結果.filter((x) => x.判定 === s).length;
    行.push(`- **${c.名前}**：${r.市町村.屋外広告物.適用条例}　→ 要確認 ${数("要確認")}・注意 ${数("注意")}・問題なさそう ${数("問題なさそう")}・該当なし ${数("該当なし")}`);
    for (const w of r.警告) 問題.push(`${c.名前}：${w}`);
  }
  行.push("", `| 観点 | ${ケース.map((c) => c.名前.split(" ")[0]).join(" | ")} |`, `|---|${ケース.map(() => ":-:").join("|")}|`);
  const 記号 = { 要確認: "要", 注意: "注", 問題なさそう: "◯", 該当なし: "－" };
  for (const k of D.観点) 行.push(`| ${k.番号} ${k.表示名} | ${全.map(({ r }) => 記号[r.結果.find((x) => x.観点.id === k.id).判定]).join(" | ")} |`);
  行.push("", "## ケースごとの理由（該当なしを除く）", "");
  for (const { c, r } of 全) {
    行.push(`### ${c.名前}`, "", "| 観点 | 判定 | 理由 | 根拠 |", "|---|---|---|---|");
    for (const x of r.結果.filter((x) => x.判定 !== "該当なし")) 行.push(`| ${x.観点.番号} ${x.観点.表示名} | ${x.判定} | ${x.理由} | ${x.出典.map((s) => s.id).join(" ") || "（記載なし）"} |`);
    行.push("");
  }
  行.push("## 点検", "", 問題.length ? 問題.map((p) => `- ${p}`).join("\n") : "- ルールの根拠の id はすべて存在し、「問題なさそう」はすべて照合済みの根拠を持つ。");
  fs.writeFileSync(path.join(ROOT, "docs", "判定_典型ケース.md"), 行.join("\n") + "\n");
  console.log(行.slice(0, 6 + ケース.length + D.観点.length + 3).join("\n"));
  if (問題.length) { console.log("\n点検で見つかったこと："); for (const p of 問題) console.log("  " + p); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
