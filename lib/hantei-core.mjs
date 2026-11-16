// 判定の中身（ファイルを読まない）。scripts/hantei.mjs と画面（app/）の両方から使う。
// D は lib/data.json の形：観点・判定・電話・あるある は配列、市町村・資料・記録 は名前/id をキーにした表。
// 記録の id の頭は、自治体の名前そのもの（例：広島県-U3-01、広島県福山市-U3-01）
export const 情報の観点 = new Set(["窓口", "適用条例"]);

/** 根拠に使ってよい記録か：引用があり、照合が一致（OCRは人の確認が済） */
export function 使える根拠(r) {
  if (!r || !r.引用 || r.状態 === "記載なし") return false;
  if (r.照合 === "一致") return true;
  return r.照合 === "一致（OCR）" && r.人の確認 === "済";
}

function 合う(条件, 入力) {
  for (const [k, v] of Object.entries(条件 ?? {})) {
    const x = 入力[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (typeof x !== "number") return false;
      if ("超" in v && !(x > v.超)) return false;
      if ("以下" in v && !(x <= v.以下)) return false;
      continue;
    }
    if (!(Array.isArray(v) ? v : [v]).includes(x)) return false;
  }
  return true;
}

export function 判定する(D, 入力) {
  const m = D.市町村[入力.市町村];
  if (!m) throw new Error(`市町村「${入力.市町村}」が市町村.yaml に無い`);
  const 屋外 = m.屋外広告物.区分 === "県" ? m.都道府県 : m.名前;
  // 都道府県の条例の市町村でも、申請先の市町村が独自に決めていること（締切・手数料など）は市町村の記録・ルールで重ねる
  const 屋外たち = [...new Set([屋外, m.名前])];
  const 景観 = null; // 更新版は景観を扱わない
  const 収録 = { 屋外広告物: m.屋外広告物.基準の収録 === "収録", 景観: false };
  const 結果 = [];
  const 警告 = [];
  for (const k of D.観点) {
    const 軸たち = k.軸 === "両方" ? ["屋外広告物", "景観"] : k.軸 === "景観" ? ["景観"] : ["屋外広告物"];
    const 管轄 = 軸たち.flatMap((a) => (a === "景観" ? [景観] : 屋外たち));
    let out;
    const 分からない = (k.判定に使う入力 ?? []).filter((n) => n !== "市町村" && 入力[n] === "分からない");
    const ルール = D.判定.find((x) => x.観点 === k.id)?.規則 ?? [];
    const 該当なし = ルール.find((r) => r.判定 === "該当なし" && 合う(r.条件, 入力));
    if (該当なし) out = { 判定: "該当なし" };
    else if (分からない.length) out = { 判定: "要確認", 理由: `「${分からない.join("・")}」が分からないため` };
    else if (!情報の観点.has(k.id) && 軸たち.every((a) => !収録[a]))
      out = { 判定: "要確認", 理由: `${管轄[0]}の${軸たち.join("・")}の基準は未収録` };
    else {
      const r = ルール.find(
        (r) => r.判定 !== "該当なし" && (!r.屋外 || 屋外たち.some((x) => r.屋外.includes(x))) && (!r.景観 || r.景観.includes(景観)) && 合う(r.条件, 入力),
      );
      out = r ? { 判定: r.判定, 理由: r.理由, 根拠: r.根拠 } : { 判定: "要確認", 理由: "資料で判断できる記載がない" };
    }
    // 根拠を、この観点の管轄の記録に絞る（窓口などの情報の観点は、県の一覧の記録も使う）
    const 接頭たち = new Set(管轄);
    let 根拠 = (out.根拠 ?? []).map((id) => D.記録[id] ?? (警告.push(`記録 ${id} が無い（${k.id}）`), null)).filter(Boolean);
    const 自分の = 根拠.filter((r) => 接頭たち.has(r.id.split("-")[0]));
    根拠 = 自分の.length || !情報の観点.has(k.id) ? 自分の : 根拠.filter((r) => r.id.startsWith(`${m.都道府県}-`));
    // 他の自治体の記録だけを根拠にした汎用のルールは、理由の文がこの自治体に当てはまるとは限らないので、言い切らない
    if (out.判定 === "要確認" && (out.根拠 ?? []).length && !根拠.length && !情報の観点.has(k.id)) {
      out = { ...out, 理由: "この自治体の資料で判断できる記載を見つけていない（窓口で確認）" };
    }
    if (out.判定 === "問題なさそう" && !根拠.some(使える根拠)) {
      警告.push(`${k.id}：「問題なさそう」に使える根拠が無いので要確認にした`);
      out = { 判定: "要確認", 理由: `${out.理由}（根拠の記録が足りない）` };
    }
    if (out.判定 === "該当なし") { 結果.push({ 観点: k, 判定: "該当なし" }); continue; }
    const 電話 = out.判定 === "問題なさそう" ? [] : [k.電話で聞く文, ...D.電話.filter((t) => 管轄.includes(t.自治体) && t.観点.includes(k.id)).map((t) => t.文)];
    const あるある = D.あるある.filter((a) => a.観点.includes(k.id));
    結果.push({
      観点: k,
      判定: out.判定,
      理由: out.理由,
      出典: 根拠.map((r) => {
        const s = D.資料[r.文書];
        return { id: r.id, 文書: r.文書, 種別: r.種別, ページ: r.ページ, 引用: r.引用, 取得日: r.取得日, 状態: r.状態, OCR: r.照合 === "一致（OCR）", url: (s?.形式 === "pdf" || /\.pdf$/i.test(s?.url ?? "")) ? `${s.url}#page=${r.ページ}` : s?.url };
      }),
      電話,
      あるある,
    });
  }
  return { 市町村: m, 屋外, 景観, 結果, 警告 };
}

/** ルール全体の点検：根拠の id が存在するか、「問題なさそう」のルールに使える根拠があるか */
export function ルールを点検(D) {
  const 問題 = [];
  for (const k of D.判定) {
    if (!D.観点.some((x) => x.id === k.観点)) 問題.push(`観点「${k.観点}」が観点.yaml に無い`);
    for (const r of k.規則) {
      for (const id of r.根拠 ?? []) if (!D.記録[id]) 問題.push(`${k.観点}：記録 ${id} が無い`);
      if (r.判定 === "問題なさそう" && !(r.根拠 ?? []).some((id) => 使える根拠(D.記録[id]))) 問題.push(`${k.観点}：「問題なさそう」に使える根拠が無い（${r.理由}）`);
      if (r.判定 !== "該当なし" && !(r.根拠 ?? []).length) 問題.push(`${k.観点}：根拠の記録が無いルール（${r.理由}）`);
    }
  }
  for (const k of D.観点) if (!D.判定.some((x) => x.観点 === k.id)) 問題.push(`観点「${k.id}」のルールが無い`);
  return 問題;
}

