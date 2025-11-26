export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // 1. Generate Alias
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let alias = '';
  for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

  // 2. Call Ulvis
  const ulvisUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(targetUrl)}&custom=${alias}&private=1&uses=1&type=json`;

  try {
    const response = await fetch(ulvisUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    });

    const rawText = await response.text();
    
    try {
      const data = JSON.parse(rawText);

      // CHECK SUCCESS (Handles 1, "1", true, "true")
      if (data.success == 1 || data.success == true || data.success == "true") {
        
        // FIX: Force create the URL if API returns it empty
        let finalShortUrl = `https://ulvis.net/${alias}`;
        if (data.data && data.data.url) {
            finalShortUrl = data.data.url;
        }

        return new Response(JSON.stringify({
          success: true,
          original_url: targetUrl,
          short_url: finalShortUrl, // Now guaranteed to exist
          alias: alias
        }), { headers: { "Content-Type": "application/json" } });

      } else {
        return new Response(JSON.stringify({
          success: false,
          error: data.error || "API returned failure",
          raw_response: data
        }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to parse JSON. Likely blocked.",
        raw_preview: rawText.substring(0, 200)
      }), { status: 502, headers: { "Content-Type": "application/json" } });
    }

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
