import os
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from curl_cffi.requests import AsyncSession # <--- The magic library
import random
import string
import asyncio
import uvicorn

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- CONFIG ---
ULVIS_API = "https://ulvis.net/API/write/get"

def generate_alias(length=4):
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

async def create_ulvis_link(long_url: str, retry_count=0):
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

    try:
        # We use AsyncSession with 'impersonate="chrome"'
        # This tricks Cloudflare into thinking we are a real browser
        async with AsyncSession(impersonate="chrome110") as session:
            response = await session.get(ULVIS_API, params=params, timeout=20)
            
            # Debug: Print what we got back
            logger.info(f"Status: {response.status_code}")

            try:
                data = response.json()
            except:
                # If we still get HTML, Cloudflare is extremely strict
                return {
                    "success": False, 
                    "error": "Cloudflare Blocked the Request", 
                    "raw": response.text[:100]
                }

            # Check Success
            success_flag = str(data.get("success", "")).lower()
            if success_flag in ["1", "true"]:
                return {
                    "success": True,
                    "original_url": long_url,
                    "short_url": data["data"]["url"],
                    "alias": alias
                }
            else:
                # Retry if alias taken
                error_msg = str(data.get("error", {}))
                if "taken" in error_msg.lower():
                    return await create_ulvis_link(long_url, retry_count + 1)
                
                return {"success": False, "error": error_msg}

    except Exception as e:
        return {"success": False, "error": str(e)}

# --- ROUTES ---

@app.get("/")
async def home():
    return {"status": "Online", "msg": "Anti-Bot System Active"}

@app.get("/short")
async def short_url(url: str):
    if not url: return JSONResponse(status_code=400, content={"error": "Missing url"})
    if not url.startswith("http"): url = "https://" + url

    result = await create_ulvis_link(url)
    
    status = 200 if result["success"] else 400
    return JSONResponse(status_code=status, content=result)

@app.post("/bulk")
async def bulk_short(request: Request):
    try:
        body = await request.json()
        urls = body.get("urls", [])
    except:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    # Concurrent processing with the anti-bot session
    tasks = [create_ulvis_link(u) for u in urls]
    results = await asyncio.gather(*tasks)

    return {"success": True, "results": results}

# --- RUNNER ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3682))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
