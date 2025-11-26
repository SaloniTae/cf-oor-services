export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const urls = body.urls;
  if (!urls || !Array.isArray(urls)) {
    return new Response(JSON.stringify({ error: "Missing 'urls' array" }), { status: 400 });
  }

  // --- HELPER: The Strict Creation Logic (Same as short.js) ---
  const createOneLink = async (targetUrl) => {
    // Ensure Protocol
    let processedUrl = targetUrl;
    if (!processedUrl.startsWith("http")) processedUrl = "https://" + processedUrl;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      
      // Generate Alias
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let alias = '';
      for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

      const ulvisUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(processedUrl)}&custom=${alias}&private=1&uses=1&type=json`;

      try {
        const res = await fetch(ulvisUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36", "Accept": "application/json" }
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch(e) { continue; } // JSON error -> Retry

        // STRICT SUCCESS CHECK
        const isSuccess = (data.success == 1 || data.success === true || data.success === "true");
        const hasUrl = (data.data && data.data.url && data.data.url.length > 0);

        if (isSuccess && hasUrl) {
          return { 
            success: true, 
            original: targetUrl, 
            short: data.data.url, 
            alias: alias 
          };
        }

        // If alias taken, loop continues. If other error, stop.
        const errMsg = data.error ? (data.error.msg || JSON.stringify(data.error)) : "Unknown";
        if (!errMsg.toLowerCase().includes("taken")) {
            return { success: false, original: targetUrl, error: errMsg };
        }

      } catch (e) {
        if (attempts === maxAttempts) return { success: false, original: targetUrl, error: "Network Error" };
      }
    }
    return { success: false, original: targetUrl, error: "Failed after 3 attempts" };
  };

  // --- CONCURRENT EXECUTION ---
  // We map the helper function to all URLs and run them in parallel
  const results = await Promise.all(urls.map(u => createOneLink(u)));

  return new Response(JSON.stringify({ 
    success: true, 
    count: results.length, 
    results 
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
