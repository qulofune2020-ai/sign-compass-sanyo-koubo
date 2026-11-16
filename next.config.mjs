/** 静的書き出し（サーバー処理なし・APIキーなし）。out/ をそのまま Vercel などに置ける */
const nextConfig = { output: "export", trailingSlash: true, images: { unoptimized: true } };
export default nextConfig;
