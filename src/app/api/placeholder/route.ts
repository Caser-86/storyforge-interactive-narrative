export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawText = searchParams.get("text") || "Loading...";
  const text = rawText.slice(0, 100).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="50%" style="stop-color:#16213e"/>
        <stop offset="100%" style="stop-color:#0f3460"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#bg)"/>
    <text x="400" y="200" text-anchor="middle" fill="#e94560" font-size="18" font-family="sans-serif">${text}</text>
    <text x="400" y="240" text-anchor="middle" fill="#aaa" font-size="14" font-family="sans-serif">Generating scene illustration...</text>
    <rect x="300" y="270" width="200" height="4" rx="2" fill="#333"/>
    <rect x="300" y="270" width="120" height="4" rx="2" fill="#e94560">
      <animate attributeName="width" from="0" to="200" dur="3s" repeatCount="indefinite"/>
    </rect>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache",
    },
  });
}
