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

  // Helper function specifically for the bulk loop
  const shortenOne = async (targetUrl) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let alias = '';
    for (let i = 0; i < 4; i++) alias += chars.charAt(Math.floor(Math.random() * chars.length));

    const ulvisUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(targetUrl)}&custom=${alias}&private=1&uses=1&type=json`;

    try {
      const res = await fetch(ulvisUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" }
      });
      const text = await res.text();
      const data = JSON.parse(text);
      
      if (data.success == 1 || data.success == true) {
        return { success: true, original: targetUrl, short: data.data.url };
      } else {
        return { success: false, original: targetUrl, error: data.error };
      }
    } catch (e) {
      return { success: false, original: targetUrl, error: "Network or JSON error" };
    }
  };

  // Concurrent Execution
  const results = await Promise.all(urls.map(u => shortenOne(u)));

  return new Response(JSON.stringify({ success: true, count: results.length, results }), {
    headers: { "Content-Type": "application/json" }
  });
}
