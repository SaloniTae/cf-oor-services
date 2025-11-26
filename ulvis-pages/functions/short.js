export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  let targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Ensure Protocol (http/https)
  if (!targetUrl.startsWith("http")) {
    targetUrl = "https://" + targetUrl;
  }

  // --- RETRY LOGIC (Try 3 times to find a free alias) ---
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;

    // 1. Generate Random 4-Char Alias
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let alias = '';
    for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

    // 2. Prepare API Call
    const ulvisUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(targetUrl)}&custom=${alias}&private=1&uses=1&type=json`;

    try {
      const response = await fetch(ulvisUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Referer": "https://ulvis.net"
        }
      });

      const rawText = await response.text();
      let data;

      // Try Parsing JSON
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        // If JSON fails, it's likely an HTML error (IP Block)
        return new Response(JSON.stringify({
          success: false,
          error: "Cloudflare/Ulvis Blocked the Request",
          raw_preview: rawText.substring(0, 100)
        }), { status: 502, headers: { "Content-Type": "application/json" } });
      }

      // 3. CHECK SUCCESS STRICTLY
      // Ulvis returns success as 1, "1", true, or "true"
      const isSuccess = data.success == 1 || data.success == true || data.success == "true";

      if (isSuccess) {
        // SUCCESS! Return the data.
        return new Response(JSON.stringify({
          success: true,
          original_url: targetUrl,
          // We construct the URL manually to be safe, but ONLY because success was true
          short_url: `https://ulvis.net/${alias}`, 
          alias: alias
        }), { headers: { "Content-Type": "application/json" } });
      } 
      
      // 4. HANDLE FAILURE
      const errorMsg = data.error ? (data.error.msg || JSON.stringify(data.error)) : "Unknown Error";

      // If alias is taken, the loop continues to next attempt
      if (errorMsg.toLowerCase().includes("taken") || errorMsg.toLowerCase().includes("already exists")) {
        // Console log for debugging (visible in CF dashboard logs)
        console.log(`Alias ${alias} taken. Retrying...`);
        continue; 
      }

      // If it's some other error (like Invalid URL), stop and report it.
      return new Response(JSON.stringify({
        success: false,
        error: errorMsg,
        raw_response: data
      }), { status: 400, headers: { "Content-Type": "application/json" } });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }
  }

  // If we run out of attempts
  return new Response(JSON.stringify({
    success: false,
    error: "Failed to generate a unique link after 3 attempts. Ulvis might be busy."
  }), { status: 500, headers: { "Content-Type": "application/json" } });
}
