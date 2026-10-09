export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/download-epub") {
      return handleDownload(request, env, url);
    }

    // Serve the existing website and static assets.
    return env.ASSETS.fetch(request);
  }
};

async function handleDownload(request, env, url) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Allow": "GET", "Cache-Control": "no-store" }
    });
  }

  const transactionId = url.searchParams.get("transaction_id");
  const lang = url.searchParams.get("lang") === "en" ? "en" : "uk";

  if (!transactionId || !/^txn_[a-z0-9]{26}$/.test(transactionId)) {
    return new Response("Invalid transaction", {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (!env.PADDLE_API_KEY || !env.BOOKS) {
    return new Response("Book delivery is not configured. Please contact the author.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  let paddleResponse;
  try {
    paddleResponse = await fetch(
      `https://api.paddle.com/transactions/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: `Bearer ${env.PADDLE_API_KEY}`,
          "Paddle-Version": "1"
        }
      }
    );
  } catch {
    return new Response("Could not verify payment with Paddle. Please try again later.", {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (!paddleResponse.ok) {
    return new Response("Transaction could not be verified", {
      status: 403,
      headers: { "Cache-Control": "no-store" }
    });
  }

  let payload;
  try {
    payload = await paddleResponse.json();
  } catch {
    return new Response("Invalid response from payment provider", {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const transaction = payload?.data;
  if (!transaction || transaction.status !== "completed") {
    return new Response("Payment is not completed", {
      status: 403,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const expectedPriceId = lang === "en"
    ? "pri_01m4e6e7cn96c1ytvg8k17vmvf"
    : "pri_01m4aawaqc3cbxaa6byrcytnnt";

  const hasBookPrice = Array.isArray(transaction.items) &&
    transaction.items.some(item => item?.price?.id === expectedPriceId);

  if (!hasBookPrice) {
    return new Response("Transaction does not contain this edition", {
      status: 403,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const objectKey = lang === "en"
    ? "THE_HELM_English_KDP_FINAL.epub"
    : "SHTURVAL_RELEASE_MASTER.epub";

  let epub;
  try {
    epub = await env.BOOKS.get(objectKey);
  } catch {
    return new Response("Could not read the EPUB from storage. Please contact the author.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (!epub) {
    return new Response("The EPUB file is not present in the private BOOKS bucket.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const filename = lang === "en" ? "THE_HELM_English.epub" : "SHTURVAL_Ukrainian.epub";
  return new Response(epub.body, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
