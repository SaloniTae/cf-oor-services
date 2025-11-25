export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. SETUP HEADERS
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    // Handle Preflight
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 2. GENERATOR FUNCTION
    function generateAlias(length = 4) {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    // 3. API CALLER (Mimics Python Requests exactly)
    async function createUlvisLink(longUrl, retryCount = 0) {
      if (retryCount > 2) throw new Error("Ulvis API is failing after 3 retries.");

      const alias = generateAlias(4);

      // EXACT parameters from your Python script
      const params = new URLSearchParams({
        url: longUrl,
        type: 'json',
        uses: '1',       // One time
        private: '1',    // Private
        custom: alias    // Custom Alias
      });

      // INCREASED TIMEOUT: 15 Seconds (Python waits forever, Workers need a limit)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); 

      try {
        const apiUrl = `https://ulvis.net/API/write/get?${params.toString()}`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            // CRITICAL: Pretend to be a real Chrome browser
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': 'https://ulvis.net/',
            'X-Requested-With': 'XMLHttpRequest'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Capture raw text first to debug if JSON fails
        const rawText = await response.text();
        
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          // If Ulvis returns HTML error instead of JSON
          throw new Error(`Ulvis returned invalid JSON: ${rawText.substring(0, 50)}...`);
        }

        // Soft check for success (handles "1", 1, true, "true")
        if (data.success == 1 || data.success == true || data.success == "1") {
          return {
            success: true,
            original_url: longUrl,
            short_url: data.data.url,
            alias: alias
          };
        } else {
          // If alias is taken, Retry
          if (data.error && JSON.stringify(data.error).includes("taken")) {
            return await createUlvisLink(longUrl, retryCount + 1);
          }
          throw new Error(data.error ? data.error.msg : "Unknown API Error");
        }

      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') throw new Error("Ulvis API Timeout (Server too slow - 15s limit)");
        throw error;
      }
    }

    // 4. ROUTE HANDLER
    if (url.pathname === '/short') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: corsHeaders });

      const finalUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;

      try {
        const result = await createUlvisLink(finalUrl);
        return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: e.message,
          tip: "If timeout persists, Ulvis might be blocking Cloudflare IPs." 
        }), { status: 502, headers: corsHeaders });
      }
    }

    // 5. BULK HANDLER
    if (url.pathname === '/bulk' && request.method === 'POST') {
      const body = await request.json();
      const results = await Promise.all(body.urls.map(u => 
        createUlvisLink(u).catch(e => ({ success: false, url: u, error: e.message }))
      ));
      return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders });
    }

    return new Response("Ulvis Worker Ready", { headers: corsHeaders });
  }
};
