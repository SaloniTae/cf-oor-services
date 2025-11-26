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

  // --- HELPER: Create Single Link (Strict Mode) ---
  const createOneLink = async (targetUrl) => {
    // 1. Cleanup URL
    let processedUrl = targetUrl.trim();
    if (!processedUrl.startsWith("http")) processedUrl = "https://" + processedUrl;

    let attempts = 0;
    const maxAttempts = 3; // Retry 3 times

    while (attempts < maxAttempts) {
      attempts++;
      
      // 2. Generate Alias
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let alias = '';
      for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

      // 3. Call API
      const ulvisUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(processedUrl)}&custom=${alias}&private=1&uses=1&type=json`;

      try {
        const res = await fetch(ulvisUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36", "Accept": "application/json" }
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch(e) { continue; } 

        // 4. Check Success
        const isSuccess = (data.success == 1 || data.success === true || data.success === "true");
        
        if (isSuccess) {
          // If API returns success but no URL, we construct it safely because success=true
          const finalShort = (data.data && data.data.url) ? data.data.url : `https://ulvis.net/${alias}`;
          
          return { 
            success: true, 
            original: targetUrl, 
            short: finalShort, 
            alias: alias 
          };
        }

        // If alias taken, retry. Else, return error.
        const errMsg = data.error ? (data.error.msg || JSON.stringify(data.error)) : "Unknown";
        if (!errMsg.toLowerCase().includes("taken")) {
            return { success: false, original: targetUrl, error: errMsg };
        }

      } catch (e) {
        if (attempts === maxAttempts) return { success: false, original: targetUrl, error: "Network Error" };
      }
    }
    return { success: false, original: targetUrl, error: "Failed after 3 retries" };
  };

  // --- EXECUTE PARALLEL ---
  const results = await Promise.all(urls.map(u => createOneLink(u)));

  return new Response(JSON.stringify({ 
    success: true, 
    count: results.length, 
    results 
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
