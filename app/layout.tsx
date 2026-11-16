import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import D from "../lib/data.json";

export const metadata = {
  title: "Sign Compass 更新版",
  description: "看板の許可を更新するときのチェック。市区町村と看板の仕様から、更新で確かめることを出典つきで出す",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const 取得日 = [...new Set(Object.values(D.資料 as Record<string, any>).map((s) => s.取得日).filter(Boolean))].sort();
  return (
    <html lang="ja">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">Sign Compass<span>（更新版）</span></Link>
            <nav>
              <Link href="/">更新を確かめる</Link>
              <Link href="/hikaku/">市区町村を比べる</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="wrap foot">
          <p><b>この表示は公開資料をもとにした目安です。申請前に必ず窓口で確認してください。</b></p>
          <p>判定は「要確認・注意・問題なさそう」の3段階で、許可の要否や違法かどうかを決めるものではありません。申請書類の作成は行政書士へ。</p>
          <p className="muted">資料の取得日：{取得日.length ? `${取得日[0]}〜${取得日[取得日.length - 1]}` : "—"}（各資料の取得日は出典の欄に表示）</p>
        </footer>
      </body>
    </html>
  );
}
