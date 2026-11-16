// npm run 確認 [-- --リンクは見ない]
// 公開前の確認。問題があれば終了コード1。
//   1. 出典リンク：画面に出る記録の資料URLを1回ずつ開き、開けるか（HTTP 200）を見る（ボット対策は回り道しない）
//   2. 判定：根拠のない「問題なさそう」が無いか（ルールの点検と、63市町村×入力の組み合わせ）
//   3. 公開してはいけない物：PDF・資料の本文（資料/・txt）が git と out/ に無いか。引用が長すぎないか。鍵の形が無いか
//   4. 照合：不一致・未照合・人の確認が済んでいないOCRの記録が無いか
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import { データを読む } from "./hantei.mjs";
import { 判定する, ルールを点検 } from "../lib/hantei-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const D = データを読む();
const 結果 = [];
const 出す = (ok, 名前, 詳細 = []) => { 結果.push({ ok, 名前, 詳細 }); console.log(`${ok ? "○" : "×"} ${名前}`); for (const d of 詳細.slice(0, 20)) console.log(`    ${d}`); if (詳細.length > 20) console.log(`    …ほか ${詳細.length - 20}件`); };

// ---- 4. 照合 ----
{
  const 記録 = Object.values(D.記録);
  const 悪い = 記録.filter((r) => r.引用 && !(r.照合 === "一致" || (r.照合 === "一致（OCR）" && r.人の確認 === "済")));
  出す(悪い.length === 0, `照合：引用のある記録 ${記録.filter((r) => r.引用).length}件がすべて一致（OCRは人の確認済み）`, 悪い.map((r) => `${r.id}：${r.照合} / 人の確認 ${r.人の確認}`));
}

// ---- 2. 判定 ----
{
  const 問題 = ルールを点検(D);
  let n = 0;
  const 面積 = [0.5, 8, 30, "分からない"];
  for (const m of D.市町村の順) for (const 種類 of D.入力.種類) for (const 表示面積 of 面積) for (const 高さ4m超 of D.入力.高さ4m超)
    for (const 板面替え of D.入力.板面替え) for (const 表示者の変更 of D.入力.表示者の変更) {
      const x = { 市町村: m, 種類, 表示面積, 高さ4m超, 板面替え, 表示者の変更 };
      let r;
      try { r = 判定する(D, x); } catch (e) { 問題.push(`${m}：${e.message}`); continue; }
      n++;
      for (const w of r.警告) 問題.push(`${m}：${w}`);
      for (const z of r.結果) {
        if (z.判定 === "問題なさそう" && !z.出典.some((s) => s.引用 && s.状態 !== "記載なし")) 問題.push(`根拠の無い問題なさそう：${m} ${z.観点.id}`);
        if (z.判定 !== "該当なし" && !z.理由) 問題.push(`理由が空：${m} ${z.観点.id}`);
      }
    }
  出す(問題.length === 0, `判定：ルールの点検と ${n.toLocaleString()}通りの入力で、根拠の無い「問題なさそう」なし`, [...new Set(問題)]);
}

// ---- 3. 公開してはいけない物 ----
{
  const 問題 = [];
  const 追跡 = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const f of 追跡) {
    if (/\.(pdf|docx?|xlsx?)$/i.test(f)) 問題.push(`git に資料の本体：${f}`);
    if (f.startsWith("資料/") && f !== "資料/.gitkeep") 問題.push(`git に資料フォルダの中身：${f}`);
    if (/\.ocr\.txt$|\/txt\//.test(f)) 問題.push(`git に資料の文字起こし：${f}`);
  }
  const out = path.join(ROOT, "out");
  if (!fs.existsSync(out)) 問題.push("out/ が無い（先に npm run build）");
  else {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(out)) if (/\.(pdf|docx?|xlsx?|txt)$/i.test(f) && !f.endsWith("robots.txt") && !/\/(index|__next.*)\.txt$/.test(f)) 問題.push(`out/ に資料らしいファイル：${path.relative(ROOT, f)}`);
  }
  for (const r of Object.values(D.記録)) if (r.引用 && r.引用.replace(/\s/g, "").length > 100) 問題.push(`長い引用（${r.引用.length}字）：${r.id}`);
  // 資料の文字起こしの長い連続（150字）が、公開する物（git・out）に紛れていないか：txt の各ページから抜き取りで照らす
  const txtDir = path.join(ROOT, "資料", "txt");
  const 公開する文字 = [...追跡.filter((f) => /\.(ya?ml|json|md|mjs|tsx?|css|py)$/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")), ...(fs.existsSync(out) ? [fs.readFileSync(path.join(ROOT, "lib", "data.json"), "utf8")] : [])].join("\n").replace(/\s/g, "");
  if (fs.existsSync(txtDir)) {
    let 見た = 0;
    for (const f of fs.readdirSync(txtDir)) {
      const t = fs.readFileSync(path.join(txtDir, f), "utf8").replace(/=====p\d+=====/g, "").replace(/\s/g, "");
      for (let i = 0; i + 150 <= t.length; i += 400) {
        const s = t.slice(i, i + 150);
        if (!/[぀-ヿ一-鿿]{60}/.test(s)) continue;
        見た++;
        if (公開する文字.includes(s)) 問題.push(`資料の本文150字が公開側にある：${f} の ${i} 字目付近`);
      }
    }
    if (!見た) 問題.push("資料の文字起こしが無く、本文の混入を調べられない");
  }
  for (const f of 追跡.filter((f) => /\.(ya?ml|json|md|mjs|tsx?|py|css)$/.test(f))) {
    const t = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (/sk-ant-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) 問題.push(`鍵の形：${f}`);
  }
  出す(問題.length === 0, "公開してはいけない物：資料の本体・文字起こし・長い引用・鍵の形が git と out/ に無い", 問題);
}

// ---- 1. 出典リンク ----
if (!process.argv.includes("--リンクは見ない")) {
  const 使う = new Set();
  for (const r of Object.values(D.記録)) { if (r.文書) 使う.add(r.文書); for (const d of r.探した資料 ?? []) 使う.add(d); }
  const 問題 = [];
  // 手で保存した資料：サイトがプログラムからの取得を断る（403）。人がブラウザで開けることはペリーが確かめ、本文を貼ってもらった。
  // この組み合わせ（手で保存 かつ 403）だけは、開けない扱いにせず別に数える
  const 手で保存 = new Set(parse(fs.readFileSync(path.join(ROOT, "data", "取得記録.yaml"), "utf8")).取得.filter((x) => x.状態 === "手で保存").map((x) => x.id));
  const 断られた = [];
  let ok = 0;
  for (const id of [...使う].sort()) {
    const url = D.資料[id]?.url;
    if (!url) { 問題.push(`${id}：URLが無い`); continue; }
    const 開く = () => { try { return execFileSync("curl", ["-sS", "-L", "-o", "/dev/null", "--max-time", "60", "-A", "kanban-yomidokoro/0.1 (link check)", "-w", "%{http_code}", url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return "通信できない"; } };
    // 一時的な失敗（503・通信の切断）に備え、失敗したときだけ30秒おいて1回だけ開き直す（ボット対策の回り道はしない）
    let code = 開く();
    if (code !== "200") { execFileSync("sleep", ["30"]); code = 開く(); }
    if (code === "200") ok++;
    else if (code === "403" && 手で保存.has(id)) 断られた.push(`${id}：403（プログラムからは断られる。手で保存した資料）　${url}`);
    else 問題.push(`${id}：${code}　${url}`);
  }
  出す(問題.length === 0, `出典リンク：画面に出る資料 ${使う.size}件のうち ${ok}件が開けた${断られた.length ? `（ほか ${断られた.length}件は手で保存した資料で、プログラムからは403）` : ""}`, [...問題, ...断られた]);
}

const 書く = ["# 公開前の確認（npm run 確認 が書く）", "", `確認日：${new Date().toISOString().slice(0, 10)}`, "", ...結果.flatMap((r) => [`- ${r.ok ? "○" : "×"} ${r.名前}`, ...r.詳細.map((d) => `  - ${d}`)])];
fs.writeFileSync(path.join(ROOT, "docs", "公開前の確認.md"), 書く.join("\n") + "\n");
if (結果.some((r) => !r.ok)) process.exitCode = 1;
