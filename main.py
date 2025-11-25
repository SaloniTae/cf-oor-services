import os
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
import httpx
import random
import string
import asyncio
import uvicorn

# 1. SETUP LOGGING (Check Render "Logs" tab to see these)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- CONFIG ---
ULVIS_API = "https://ulvis.net/API/write/get"
TIMEOUT = 20.0  # Extended timeout

def generate_alias(length=4):
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

async def create_ulvis_link(client: httpx.AsyncClient, long_url: str, retry_count=0):
    if retry_count > 2:
        return {"success": False, "error": "Could not generate unique alias."}

    alias = generate_alias(4)
    
    params = {
        "url": long_url,
        "type": "json",
        "uses": "1",
        "private": "1",
        "custom": alias
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        logger.info(f"Sending request to Ulvis for {long_url} with alias {alias}")
        
        response = await client.get(ULVIS_API, params=params, headers=headers, timeout=TIMEOUT)
        
        # Log the raw response for debugging
        logger.info(f"Ulvis Response Code: {response.status_code}")
        
        try:
            data = response.json()
        except:
            # If Ulvis returns HTML (Cloudflare block), return the text for debugging
            return {
                "success": False, 
                "error": "Ulvis returned invalid JSON. Use a VPN/Proxy or different host.", 
                "raw_response": response.text[:200]
            }

        # Success Check
        success_flag = str(data.get("success", "")).lower()
        if success_flag in ["1", "true"]:
            return {
                "success": True,
                "original_url": long_url,
                "short_url": data["data"]["url"],
                "alias": alias
            }
        else:
            # Retry logic
            error_msg = str(data.get("error", {}))
            if "taken" in error_msg.lower():
                logger.info("Alias taken, retrying...")
                return await create_ulvis_link(client, long_url, retry_count + 1)
            
            return {"success": False, "error": error_msg}

    except httpx.TimeoutException:
        return {"success": False, "error": "Request Timed Out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# --- ROUTES ---

@app.get("/")
async def home():
    # If this loads, your server is working!
    return {"status": "Online", "msg": "Server is running correctly"}

@app.get("/short")
async def short_url(url: str):
    if not url:
        return JSONResponse(status_code=400, content={"error": "Missing url"})

    if not url.startswith("http"):
        url = "https://" + url

    async with httpx.AsyncClient() as client:
        result = await create_ulvis_link(client, url)
    
    # ALWAYS return 200 or 400. NEVER 502.
    status = 200 if result["success"] else 400
    return JSONResponse(status_code=status, content=result)

@app.post("/bulk")
async def bulk_short(request: Request):
    try:
        body = await request.json()
        urls = body.get("urls", [])
    except:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    async with httpx.AsyncClient() as client:
        tasks = [create_ulvis_link(client, u) for u in urls]
        results = await asyncio.gather(*tasks)

    return {"success": True, "results": results}

# --- RUNNER ---
if __name__ == "__main__":
    # This block handles the PORT automatically
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
