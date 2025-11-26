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

  // Helper: Delay function to prevent API Rate Limiting
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const createOneLink = async (targetUrl) => {
    let processedUrl = targetUrl.trim();
    if (!processedUrl.startsWith("http")) processedUrl = "https://" + processedUrl;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      
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
        try { data = JSON.parse(text); } catch(e) { continue; } 

        const isSuccess = (data.success == 1 || data.success === true || data.success === "true");
        
        if (isSuccess) {
          const finalShort = (data.data && data.data.url) ? data.data.url : `https://ulvis.net/${alias}`;
          return { success: true, original: targetUrl, short: finalShort, alias: alias };
        }

        const errMsg = data.error ? (data.error.msg || JSON.stringify(data.error)) : "Unknown";
        if (!errMsg.toLowerCase().includes("taken")) {
            return { success: false, original: targetUrl, error: errMsg };
        }

      } catch (e) {
        if (attempts === maxAttempts) return { success: false, original: targetUrl, error: "Network Error" };
      }
    }
    return { success: false, original: targetUrl, error: "Failed after retries" };
  };

  // --- STAGGERED EXECUTION ---
  // We do not use Promise.all here because it fires everything at once.
  // We loop through and wait a tiny bit to ensure Ulvis processes every link.
  const results = [];
  for (const u of urls) {
      const result = await createOneLink(u);
      results.push(result);
      // Wait 300ms between requests to ensure stability
      await delay(300); 
  }

  return new Response(JSON.stringify({ 
    success: true, 
    count: results.length, 
    results 
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
