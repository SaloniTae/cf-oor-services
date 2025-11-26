export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const inputLink = reqUrl.searchParams.get('url');

  if (!inputLink) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), { status: 400 });
  }

  // Extract Alias
  let alias = inputLink;
  if (alias.includes("://")) alias = alias.split("://")[1];
  if (alias.includes("/")) {
    if (alias.endsWith("/")) alias = alias.slice(0, -1); 
    const parts = alias.split("/");
    alias = parts[parts.length - 1];
  }

  const ulvisUrl = `https://ulvis.net/API/read/get?id=${alias}&type=json`;

  try {
    const response = await fetch(ulvisUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" }
    });
    
    let data;
    try { data = await response.json(); } catch (e) { return new Response(JSON.stringify({ error: "API Error" }), { status: 502 }); }

    if (!data.success) {
      return new Response(JSON.stringify({ status: "INVALID", error: "Link not found" }), { status: 404 });
    }

    const info = data.data;
    const hits = parseInt(info.hits || 0);
    const lastTimeUnix = parseInt(info.last || 0);

    // --- STATUS LOGIC ---
    let statusMessage = "";
    let fraudVerdict = "";
    
    if (hits === 0) {
        statusMessage = "FRESH";
        fraudVerdict = "User has NOT opened this link.";
    } else {
        statusMessage = "USED";
        fraudVerdict = "User OPENED this link.";
    }

    // --- FIXED TIMESTAMP (Uppercase AM/PM) ---
    let timeIST = "Never";
    if (lastTimeUnix > 0) {
        const date = new Date(lastTimeUnix * 1000);
        
        // 1. Generate string in Indian Format (usually lowercase am/pm)
        let rawTime = date.toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata", 
            dateStyle: "medium", 
            timeStyle: "medium" 
        });

        // 2. Force Uppercase AM/PM
        // This turns "26 Nov 2025, 7:33:45 pm" -> "26 Nov 2025, 7:33:45 PM"
        timeIST = rawTime.replace("am", "AM").replace("pm", "PM").replace("a.m.", "AM").replace("p.m.", "PM");
    }

    return new Response(JSON.stringify({
        link_status: statusMessage,
        fraud_analysis: fraudVerdict,
        evidence: {
            hits: hits,
            last_activity_ist: timeIST
        }
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
