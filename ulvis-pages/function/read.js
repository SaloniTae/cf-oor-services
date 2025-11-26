export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const alias = url.searchParams.get('alias');

  if (!alias) return new Response("Missing alias", { status: 400 });

  // Using Ulvis READ API
  const ulvisUrl = `https://ulvis.net/API/read/get?id=${alias}&type=json`;

  const response = await fetch(ulvisUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" }
  });

  const data = await response.text();

  return new Response(data, {
    headers: { "Content-Type": "application/json" }
  });
}
