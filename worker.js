export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. FAST HEADERS (CORS allowed)
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
    };

    // 2. GENERATOR: 4-Char Alphanumeric (A-Z, a-z, 0-9)
    function generateAlias(length = 4) {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    // 3. THE CORE FUNCTION (Replicates your Python logic)
    async function createUlvisLink(longUrl, retryCount = 0) {
      // Stop infinite loops if API is acting up
      if (retryCount > 3) {
        throw new Error("Failed to generate unique alias after 3 attempts");
      }

      const alias = generateAlias(4);

      // Construct URL parameters exactly like your Python script
      const params = new URLSearchParams({
        url: longUrl,
        type: 'json',
        uses: '1',       // ONE TIME LINK
        private: '1',    // PRIVATE
        custom: alias    // 4-CHAR ALIAS
      });

      // Set a timeout so we don't hang if Ulvis is down (5 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const apiResponse = await fetch(`https://ulvis.net/API/write/get?${params.toString()}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await apiResponse.json();

        // Check Success (Ulvis returns success: true or 1)
        if (data.success == true || data.success == "1") {
          return {
            success: true,
            original_url: longUrl,
            short_url: data.data.url,
            alias: alias,
            one_time_use: true
          };
        } else {
          // If error is "alias already taken", retry recursively
          if (data.error && data.error.msg && data.error.msg.includes("taken")) {
            return await createUlvisLink(longUrl, retryCount + 1);
          }
          throw new Error(data.error ? data.error.msg : "Unknown API error");
        }
      } catch (error) {
        // If it was a timeout or network error
        if (error.name === 'AbortError') throw new Error("Ulvis API Timeout");
        throw error;
      }
    }

    // 4. ROUTE: /short?url=...
    if (url.pathname === '/short') {
      const targetUrl = url.searchParams.get('url');

      if (!targetUrl) {
        return new Response(JSON.stringify({ success: false, error: 'Missing ?url= parameter' }), { status: 400, headers });
      }

      try {
        // Add https if missing
        const finalUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
        
        // Execute logic
        const result = await createUlvisLink(finalUrl);
        
        return new Response(JSON.stringify(result), { status: 200, headers });

      } catch (err) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: err.message,
          original_url: targetUrl
        }), { status: 502, headers });
      }
    }

    // 5. ROUTE: /bulk (Concurrent Handling)
    if (url.pathname === '/bulk' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.urls || !Array.isArray(body.urls)) throw new Error("Missing 'urls' array");

        // Promise.all sends ALL requests at the exact same time (Concurrent)
        const results = await Promise.all(body.urls.map(u => 
          createUlvisLink(u).catch(e => ({ success: false, url: u, error: e.message }))
        ));

        return new Response(JSON.stringify({ success: true, results }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
      }
    }

    // Default Home Response
    return new Response(JSON.stringify({
      status: "Online",
      usage: "/short?url=https://google.com"
    }), { headers });
  }
};
