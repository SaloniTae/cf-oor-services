export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const inputLink = reqUrl.searchParams.get('url'); // Now accepts ?url=...

  if (!inputLink) {
    return new Response(JSON.stringify({ 
      error: "Missing 'url' parameter.", 
      usage: "/verify?url=https://ulvis.net/hOPL" 
    }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // --- 1. EXTRACT ALIAS FROM LINK ---
  // Logic: Handle "https://ulvis.net/hOPL", "ulvis.net/hOPL", or just "hOPL"
  let alias = inputLink;

  // Remove http/https
  if (alias.includes("://")) {
    alias = alias.split("://")[1];
  }
  
  // Split by '/' and take the last part
  if (alias.includes("/")) {
    // Remove trailing slash if present (e.g. ulvis.net/abcd/)
    if (alias.endsWith("/")) {
      alias = alias.slice(0, -1); 
    }
    const parts = alias.split("/");
    alias = parts[parts.length - 1]; // Get the last part
  }

  // --- 2. CALL ULVIS READ API ---
  const ulvisUrl = `https://ulvis.net/API/read/get?id=${alias}&type=json`;

  try {
    const response = await fetch(ulvisUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" }
    });

    const rawText = await response.text();
    let data;
    
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid response from Ulvis API", raw: rawText }), { status: 502 });
    }

    if (!data.success) {
      return new Response(JSON.stringify({ 
        status: "INVALID",
        error: "Link not found.", 
        details: "This link does not exist or was deleted."
      }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // --- 3. ANALYZE DATA (Fraud Detection) ---
    const info = data.data;
    const hits = parseInt(info.hits || 0);     // Total Clicks
    const uses = parseInt(info.uses || 0);     // Clicks Remaining
    const lastTimeUnix = parseInt(info.last || 0); // Timestamp

    let statusMessage = "";
    let fraudVerdict = "";
    
    if (hits === 0) {
        statusMessage = "FRESH (UNUSED)";
        fraudVerdict = "✅ TRUTH: The customer has NOT opened the link yet.";
    } else {
        statusMessage = "USED (OPENED)";
        fraudVerdict = "⚠️ ALERT: The customer OPENED this link. Redirect successful.";
    }

    // --- 4. TIMESTAMP CONVERSION (IST) ---
    let timeIST = "Never Opened";
    if (lastTimeUnix > 0) {
        const date = new Date(lastTimeUnix * 1000);
        timeIST = date.toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata",
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true
        });
    }

    // --- 5. RETURN REPORT ---
    return new Response(JSON.stringify({
        link_status: statusMessage,
        fraud_analysis: fraudVerdict,
        evidence: {
            extracted_alias: alias,
            total_clicks: hits,
            clicks_remaining: uses,
            last_activity_ist: timeIST
        }
    }, null, 2), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
