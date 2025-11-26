export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // 1. Setup 4-Char Alias
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let alias = '';
  for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

  // 2. Prepare Ulvis Parameters
  const ulvisUrl = new URL("https://ulvis.net/API/write/get");
  ulvisUrl.searchParams.set("url", targetUrl);
  ulvisUrl.searchParams.set("custom", alias);
  ulvisUrl.searchParams.set("private", "1");
  ulvisUrl.searchParams.set("uses", "1");
  ulvisUrl.searchParams.set("type", "json");

  try {
    // 3. Call Ulvis (with error capturing)
    const response = await fetch(ulvisUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://ulvis.net"
      }
    });

    // 4. Capture Raw Text (To show EXACT error if valid JSON fails)
    const rawText = await response.text();

    try {
      const data = JSON.parse(rawText);
      
      // Check if Ulvis says success
      if (data.success == 1 || data.success == true || data.success == "true") {
        return new Response(JSON.stringify({
          success: true,
          original_url: targetUrl,
          short_url: data.data.url,
          alias: alias
        }), { headers: { "Content-Type": "application/json" } });
      } else {
        // Logic failure (e.g. Alias taken)
        return new Response(JSON.stringify({
          success: false,
          error: data.error || "Unknown API Error",
          raw_response: data
        }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

    } catch (e) {
      // 5. JSON PARSE FAILED -> Show Raw HTML Error
      // This usually happens when Cloudflare blocks the IP
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to parse JSON. Likely blocked by Cloudflare/Ulvis.",
        raw_error_preview: rawText.substring(0, 500) // Shows the first 500 chars of the HTML error
      }), { status: 502, headers: { "Content-Type": "application/json" } });
    }

  } catch (err) {
    // Network failure
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
