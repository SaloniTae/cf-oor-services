export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  let targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Ensure https://
  if (!targetUrl.startsWith("http")) {
    targetUrl = "https://" + targetUrl;
  }

  let attempts = 0;
  const maxAttempts = 4; // Increased retries

  while (attempts < maxAttempts) {
    attempts++;

    // 1. Generate Alias
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let alias = '';
    for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

    // 2. Call API
    const ulvisUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(targetUrl)}&custom=${alias}&private=1&uses=1&type=json`;

    try {
      const response = await fetch(ulvisUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });

      const rawText = await response.text();
      let data;

      try {
        data = JSON.parse(rawText);
      } catch (e) {
        // Cloudflare block or bad response
        if (attempts === maxAttempts) {
            return new Response(JSON.stringify({
                success: false, 
                error: "Ulvis API Error (Invalid JSON)",
                raw: rawText.substring(0, 100)
            }), { status: 502, headers: { "Content-Type": "application/json" } });
        }
        continue; // Try again
      }

      // 3. STRICT VALIDATION
      // We check if success is true AND if the data object has a URL.
      // We do NOT trust success=true alone.
      const isSuccess = (data.success == 1 || data.success === true || data.success === "true");
      const hasUrl = (data.data && data.data.url && data.data.url.length > 0);

      if (isSuccess && hasUrl) {
        return new Response(JSON.stringify({
          success: true,
          original_url: targetUrl,
          short_url: data.data.url, // DIRECTLY FROM API. No guessing.
          alias: alias
        }), { headers: { "Content-Type": "application/json" } });
      } 
      
      // 4. ERROR HANDLING
      const errorMsg = data.error ? (data.error.msg || JSON.stringify(data.error)) : "Unknown";

      // If taken, retry
      if (errorMsg.toLowerCase().includes("taken") || errorMsg.toLowerCase().includes("exists")) {
        continue;
      }

      // Other errors (like invalid URL format) -> Fail immediately
      if (attempts === maxAttempts) {
          return new Response(JSON.stringify({
            success: false,
            error: errorMsg,
            raw_response: data
          }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

    } catch (err) {
      if (attempts === maxAttempts) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
      }
    }
  }

  // Final Fallback
  return new Response(JSON.stringify({
    success: false,
    error: "Failed to generate link. API might be unresponsive."
  }), { status: 500, headers: { "Content-Type": "application/json" } });
}
