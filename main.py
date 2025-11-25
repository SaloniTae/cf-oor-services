from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
import httpx
import random
import string
import asyncio
import uvicorn

app = FastAPI()

# --- CONFIGURATION ---
ULVIS_API = "https://ulvis.net/API/write/get"
TIMEOUT = 15.0  # Seconds

def generate_alias(length=4):
    """Generate random 4-char string (A-Z, a-z, 0-9)"""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

async def create_ulvis_link(client: httpx.AsyncClient, long_url: str, retry_count=0):
    """
    Async function to contact Ulvis.
    Handles retries, headers, and concurrency.
    """
    # Prevent infinite recursion
    if retry_count > 3:
        return {
            "success": False, 
            "error": "Failed to generate unique alias after 3 attempts", 
            "original_url": long_url
        }

    alias = generate_alias(4)

    params = {
        "url": long_url,
        "type": "json",
        "uses": "1",       # One-Time Link
        "private": "1",    # Private
        "custom": alias    # Custom 4-char code
    }

    # Fake Browser Headers to avoid Bot Detection
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }

    try:
        response = await client.get(ULVIS_API, params=params, headers=headers, timeout=TIMEOUT)
        
        # Try to parse JSON (Ulvis sometimes returns HTML error pages if blocked)
        try:
            data = response.json()
        except:
            return {
                "success": False, 
                "error": "Ulvis returned invalid JSON (IP likely blocked)", 
                "original_url": long_url
            }

        # Check Success (Handles 1, "1", true, "true")
        success_flag = str(data.get("success", "")).lower()
        is_success = success_flag in ["1", "true"]

        if is_success:
            return {
                "success": True,
                "original_url": long_url,
                "short_url": data["data"]["url"],
                "alias": alias
            }
        else:
            # Logic: If alias is taken, retry with new alias
            error_msg = str(data.get("error", {}))
            if "taken" in error_msg.lower():
                return await create_ulvis_link(client, long_url, retry_count + 1)
            
            return {
                "success": False, 
                "error": error_msg, 
                "original_url": long_url
            }

    except httpx.TimeoutException:
        return {"success": False, "error": "Request Timed Out", "original_url": long_url}
    except Exception as e:
        return {"success": False, "error": str(e), "original_url": long_url}

# --- ENDPOINTS ---

@app.get("/")
async def home():
    return {
        "status": "Online", 
        "usage": "/short?url=https://example.com",
        "bulk": "POST /bulk with json {'urls': ['...']}"
    }

@app.get("/short")
async def short_url(url: str):
    """
    Single URL Shortener
    Usage: GET /short?url=https://google.com
    """
    if not url:
        return JSONResponse(status_code=400, content={"error": "Missing 'url' parameter"})

    if not url.startswith("http"):
        url = "https://" + url

    async with httpx.AsyncClient() as client:
        result = await create_ulvis_link(client, url)
    
    status_code = 200 if result["success"] else 502
    return JSONResponse(status_code=status_code, content=result)

@app.post("/bulk")
async def bulk_short(request: Request):
    """
    Concurrent Bulk Shortener
    Accepts JSON: {"urls": ["url1", "url2"]}
    """
    try:
        body = await request.json()
        urls = body.get("urls")
    except:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})

    if not urls or not isinstance(urls, list):
        return JSONResponse(status_code=400, content={"error": "Missing 'urls' list in JSON"})

    # Process ALL urls at the exact same time (Parallel)
    async with httpx.AsyncClient() as client:
        tasks = [create_ulvis_link(client, u) for u in urls]
        results = await asyncio.gather(*tasks)

    return {
        "success": True,
        "total_processed": len(results),
        "results": results
    }

# --- RUNNER ---
if __name__ == "__main__":
    # Workers=4 allows utilizing multiple CPU cores
    uvicorn.run("main:app", host="0.0.0.0", port=8000, workers=4)
