// api/gemini.js
// Прокси между PHP-бэкендом (Россия) и Gemini API (Google блокирует запросы
// из некоторых регионов — ошибка "User location is not supported").
// Vercel-функция выполняется на серверах Google/Vercel в поддерживаемом
// регионе, поэтому запрос до Gemini доходит нормально.
//
// Защита: PHP обязан прислать заголовок X-Proxy-Secret со значением,
// совпадающим с переменной окружения PROXY_SECRET. Без этого — 401,
// и запрос до Google вообще не доходит. Так чужой человек не сможет
// использовать этот эндпоинт и жечь ваш лимит Gemini.
//
// Ключ Gemini здесь и только здесь (переменная окружения GEMINI_API_KEY
// на Vercel) — на PHP-сервере он больше не нужен.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const proxySecret = req.headers['x-proxy-secret'];
  if (!proxySecret || proxySecret !== process.env.PROXY_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not set on the proxy' });
    return;
  }

  // Модель передаём от PHP, чтобы не хардкодить её тут и не дублировать
  // конфиг в двух местах.
  const model = req.body?.model;
  const payload = req.body?.payload;

  if (!model || !payload) {
    res.status(400).json({ error: 'Missing "model" or "payload" in request body' });
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request to Gemini failed: ' + String(err) });
  }
}
