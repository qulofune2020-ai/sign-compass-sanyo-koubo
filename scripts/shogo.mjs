// npm run 照合 [-- <自治体>]
// data/基準/*.yaml の各記録の「引用」が、本当にその資料の文字に入っているかをプログラムで照らし合わせる。AI は使わない。
// 手本 yomidokoro（MIT）の照合（shogo.ts）の考え方を借り、吸収する違いを「空白・改行」だけに狭めた。
//   一致   ：正規化した引用が、書いたページ（またはそのページと次のページのつなぎ目）にそのまま入っている
//           別のページにそのまま入っていたときも一致とし、ページを直して「ページ訂正」に数える
//   近似   ：そのままは無いが、文字の並び（2文字ずつ）の似ている度合いが 0.9 以上の箇所がある（人が目で見る）
//   不一致 ：それ以外（言い換え・写し間違い）。捨てずに残す
//   未照合 ：資料の文字が無い（取得していない・文字にしていない）
// 記録に「文字の元: OCR」があるときは、画像から起こした文字（資料/txt/<文書>.ocr.txt）と照らし、
//   結果に「（OCR）」を付ける。OCR は全角・半角の揺れが多いので、このときだけ NFKC で幅をそろえる。
//   OCR の読み違いがあるので、OCR の記録は人が原本の画像と見比べるまで判定の根拠にしない。
// あわせて、取得日・sha256・種別・軸を資料の記録から書き込む（手で書かない）。
import fs from "node:fs";
import path from "node:path";
import { parse, parseDocument } from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const 読む = (f) => parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const 資料 = new Map(読む("data/資料.yaml").資料.map((r) => [r.id, r]));
const 取得 = new Map(読む("data/取得記録.yaml").取得.map((r) => [r.id, r]));
const 観点 = new Map(読む("data/観点.yaml").観点.map((r) => [r.id, r]));
const 長さの目安 = 100;

/** 正規化：Unicode の合成をそろえ、空白・改行（全角の空白を含む）だけを取り除く。それ以外の違いは吸収しない */
export const 正規化 = (s) => String(s).normalize("NFC").replace(/[\s　]+/g, "");
const OCR正規化 = (s) => 正規化(String(s).normalize("NFKC"));

const 本の置き場 = new Map();
function ページたち(文書, OCR = false) {
  const key = 文書 + (OCR ? ".ocr" : "");
  if (本の置き場.has(key)) return 本の置き場.get(key);
  const f = path.join(ROOT, "資料", "txt", `${key}.txt`);
  const 正 = OCR ? OCR正規化 : 正規化;
  let m = null;
  if (fs.existsSync(f)) {
    m = new Map();
    const t = fs.readFileSync(f, "utf8");
    const parts = t.split(/^=====p(\d+)=====$/m);
    for (let i = 1; i < parts.length; i += 2) m.set(Number(parts[i]), 正(parts[i + 1]));
  }
  本の置き場.set(key, m);
  return m;
}

function 二文字(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
  return out;
}
function 似ている度合い(a, b) {
  const A = 二文字(a), B = 二文字(b);
  let 共通 = 0;
  for (const [k, n] of A) 共通 += Math.min(n, B.get(k) ?? 0);
  return (2 * 共通) / Math.max(1, a.length - 1 + b.length - 1);
}
function 一番似ている(q, 本文) {
  let best = 0;
  const w = q.length;
  for (let i = 0; i + w <= 本文.length; i += Math.max(1, Math.floor(w / 8))) {
    best = Math.max(best, 似ている度合い(q, 本文.slice(i, i + w)));
    if (best >= 0.999) break;
  }
  return best;
}

export function 照らす(文書, ページ, 引用, OCR = false) {
  const pages = ページたち(文書, OCR);
  if (!pages) return { 照合: "未照合", ページ };
  const q = (OCR ? OCR正規化 : 正規化)(引用);
  if (q.length < 4) return { 照合: "不一致", ページ };
  if (pages.get(ページ)?.includes(q)) return { 照合: "一致", ページ };
  const 次 = pages.get(ページ + 1);
  if (次 && (pages.get(ページ) + 次).includes(q)) return { 照合: "一致", ページ };
  for (const [p, t] of pages) if (t.includes(q)) return { 照合: "一致", ページ: p, 訂正: true };
  for (const [p, t] of pages) {
    const 次p = pages.get(p + 1);
    if (次p && (t + 次p).includes(q)) return { 照合: "一致", ページ: p, 訂正: true };
  }
  let best = { 度合い: 0, ページ };
  for (const [p, t] of pages) {
    const s = 一番似ている(q, t);
    if (s > best.度合い) best = { 度合い: s, ページ: p };
  }
  if (best.度合い >= 0.9) return { 照合: "近似", ページ: best.ページ, 度合い: best.度合い };
  return { 照合: "不一致", ページ, 度合い: best.度合い };
}

function main() {
  const 絞る = process.argv[2];
  const dir = path.join(ROOT, "data", "基準");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") && (!絞る || f.startsWith(絞る)));
  const 全体 = { 一致: 0, 近似: 0, 不一致: 0, 未照合: 0, "一致（OCR）": 0, "近似（OCR）": 0, "不一致（OCR）": 0, "未照合（OCR）": 0, 記載なし: 0, ページ訂正: 0, 長い引用: 0 };
  const 問題 = [];
  for (const f of files) {
    const doc = parseDocument(fs.readFileSync(path.join(dir, f), "utf8"));
    const 記録 = doc.get("記録");
    const ids = new Set();
    for (const item of 記録.items) {
      const r = item.toJSON();
      if (ids.has(r.id)) 問題.push(`id の重複：${r.id}`);
      ids.add(r.id);
      const k = 観点.get(r.観点);
      if (!k) { 問題.push(`${r.id}：観点「${r.観点}」が観点.yaml に無い`); continue; }
      if (!r.軸) item.set("軸", k.軸);
      if (r.状態 === "記載なし") {
        全体.記載なし++;
        for (const d of r.探した資料 ?? []) if (!資料.has(d)) 問題.push(`${r.id}：探した資料「${d}」が資料.yaml に無い`);
        continue;
      }
      const s = 資料.get(r.文書), g = 取得.get(r.文書);
      if (!s || !g) { 問題.push(`${r.id}：文書「${r.文書}」が資料.yaml か取得記録に無い`); continue; }
      item.set("種別", s.種別);
      item.set("取得日", g.取得日);
      item.set("sha256", g.sha256);
      const OCR = r.文字の元 === "OCR";
      const res = 照らす(r.文書, r.ページ, r.引用, OCR);
      if (OCR) res.照合 += "（OCR）";
      if (res.訂正) { 全体.ページ訂正++; 問題.push(`ページ訂正 ${r.id}：p.${r.ページ} → p.${res.ページ}`); item.set("ページ", res.ページ); }
      else if (res.ページ !== r.ページ) item.set("ページ", res.ページ);
      item.set("照合", res.照合);
      if (res.度合い !== undefined && !res.照合.startsWith("一致")) item.set("似ている度合い", Number(res.度合い.toFixed(2)));
      else item.delete("似ている度合い");
      if (!r.人の確認) item.set("人の確認", "未");
      全体[res.照合]++;
      if (!res.照合.startsWith("一致")) 問題.push(`${res.照合} ${r.id}（${r.文書} p.${res.ページ}${res.度合い !== undefined ? `、似ている度合い ${res.度合い.toFixed(2)}` : ""}）：${r.引用}`);
      if (正規化(r.引用).length > 長さの目安) { 全体.長い引用++; 問題.push(`長い引用 ${r.id}：${正規化(r.引用).length}字`); }
    }
    fs.writeFileSync(path.join(dir, f), doc.toString({ lineWidth: 0 }));
  }
  console.log(`一致 ${全体.一致}　近似 ${全体.近似}　不一致 ${全体.不一致}　未照合 ${全体.未照合}　｜OCR：一致 ${全体["一致（OCR）"]}　近似 ${全体["近似（OCR）"]}　不一致 ${全体["不一致（OCR）"]}　（記載なし ${全体.記載なし}、ページ訂正 ${全体.ページ訂正}、長い引用 ${全体.長い引用}）`);
  for (const l of 問題) console.log("  " + l);
  if (全体.不一致 || 全体.未照合 || 全体["不一致（OCR）"] || 全体["未照合（OCR）"]) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
