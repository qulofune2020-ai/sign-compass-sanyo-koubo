// npm run 取得 [-- <id>...]
// data/資料.yaml の URL から資料を 資料/ に取ってきて、data/取得記録.yaml に
// 取得日・sha256・サイズ・形式・最終更新（Last-Modified）・行き着いたURL を書く。
// 本体（資料/）は .gitignore 済み。リポジトリには取得記録だけが入る。
// ボット対策は回り道しない：1回だけ取りにいき、失敗や想定外の中身なら「手で保存してほしい」と記録して次へ。
// すでに 資料/ に手で置かれたファイルは取りにいかず、そのまま登録する。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const 置き場 = path.join(ROOT, "資料");
const 記録ファイル = path.join(ROOT, "data", "取得記録.yaml");
const UA = "kanban-yomidokoro/0.1 (research; one request per document)";

const 一覧 = parse(fs.readFileSync(path.join(ROOT, "data", "資料.yaml"), "utf8")).資料;
const 前の記録 = fs.existsSync(記録ファイル) ? parse(fs.readFileSync(記録ファイル, "utf8")).取得 ?? [] : [];
const 絞る = process.argv.slice(2);
const 今日 = new Date().toISOString().slice(0, 10);

function 形式(先頭, ct) {
  if (先頭.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (/html/i.test(ct) || /<html|<!doctype/i.test(先頭.toString("latin1"))) return "html";
  return null;
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function 取る(url, 保存先) {
  // curl：プロキシの設定を引き継ぐ。リダイレクトは追う。1回だけ。
  const 頭 = 保存先 + ".headers";
  let 状態 = 0, 行き先 = url;
  try {
    const out = execFileSync("curl", ["-sS", "-L", "--max-time", "90", "-A", UA, "-D", 頭, "-o", 保存先, "-w", "%{http_code} %{url_effective}", url], { encoding: "utf8" });
    [状態, 行き先] = [Number(out.split(" ")[0]), out.split(" ").slice(1).join(" ")];
  } catch (e) {
    return { 失敗: `通信できない：${String(e.stderr || e.message).trim().split("\n").pop()}` };
  }
  const h = fs.existsSync(頭) ? fs.readFileSync(頭, "latin1") : "";
  fs.rmSync(頭, { force: true });
  const 最後 = h.split(/\r?\n\r?\n/).filter(Boolean).pop() ?? "";
  const 見出し = (n) => (new RegExp(`^${n}:\\s*(.+)$`, "im").exec(最後)?.[1] ?? "").trim();
  return { 状態, 行き先, ct: 見出し("content-type"), 最終更新: 見出し("last-modified") || null };
}

const 結果 = [];
for (const r of 一覧) {
  if (絞る.length && !絞る.includes(r.id)) {
    const old = 前の記録.find((x) => x.id === r.id);
    if (old) 結果.push(old);
    continue;
  }
  const 期待 = /\.pdf($|\?)/i.test(r.url) ? "pdf" : "html";
  const 名前 = `${r.id}.${期待}`;
  const 先 = path.join(置き場, 名前);
  const 記録 = { id: r.id, url: r.url };
  // 手で置いたファイル：前回取れなかった（または手で保存した）資料で、ファイルが置いてあれば、取りに行かずに登録する
  const 手置き = fs.existsSync(先) && !前の記録.find((x) => x.id === r.id && x.状態 === "取得済み");
  if (!手置き) {
    const res = 取る(r.url, 先);
    if (res.失敗) {
      fs.rmSync(先, { force: true });
      Object.assign(記録, { 状態: "取れない", 理由: res.失敗, 試した日: 今日 });
      結果.push(記録);
      console.log(`× ${r.id}：${res.失敗}`);
      continue;
    }
    const buf = fs.existsSync(先) ? fs.readFileSync(先) : Buffer.alloc(0);
    const k = 形式(buf.subarray(0, 512), res.ct);
    if (res.状態 !== 200 || k !== 期待) {
      fs.rmSync(先, { force: true });
      const 理由 = res.状態 !== 200 ? `HTTP ${res.状態}` : `中身が ${期待} でない（${res.ct || "形式不明"}）`;
      Object.assign(記録, { 状態: "取れない", 理由, 行き着いたURL: res.行き先 !== r.url ? res.行き先 : undefined, 試した日: 今日 });
      結果.push(記録);
      console.log(`× ${r.id}：${理由}`);
      continue;
    }
    Object.assign(記録, { 行き着いたURL: res.行き先 !== r.url ? res.行き先 : undefined, 最終更新: res.最終更新 ?? undefined });
  }
  const buf = fs.readFileSync(先);
  let ページ数;
  if (期待 === "pdf") {
    try {
      ページ数 = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [先], { encoding: "utf8" }))?.[1]);
    } catch {}
  }
  Object.assign(記録, { 状態: 手置き ? "手で保存" : "取得済み", ファイル: 名前, 取得日: 今日, sha256: sha(buf), サイズ: buf.length, 形式: 期待, ページ数 });
  for (const k of Object.keys(記録)) if (記録[k] === undefined) delete 記録[k];
  結果.push(記録);
  console.log(`○ ${r.id}（${期待}${ページ数 ? ` ${ページ数}頁` : ""}、${buf.length}バイト）`);
}

fs.writeFileSync(記録ファイル, "# npm run 取得 が書く。手で直さない\n" + stringify({ 取得: 結果 }, { lineWidth: 0 }));
const 数 = (s) => 結果.filter((x) => x.状態 === s).length;
console.log(`\n取得済み ${数("取得済み")}　手で保存 ${数("手で保存")}　取れない ${数("取れない")}`);
