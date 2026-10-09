export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transaction_id");
  const lang = url.searchParams.get("lang") === "en" ? "en" : "uk";

  if (!transactionId || !/^txn_[a-z0-9]{26}$/.test(transactionId)) {
    return new Response("Invalid transaction", { status: 400 });
  }

  if (!env.PADDLE_API_KEY || !env.BOOKS) {
    return new Response("Book delivery is not configured. Please contact the author.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const paddleResponse = await fetch(
    `https://api.paddle.com/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.PADDLE_API_KEY}`,
        "Paddle-Version": "1"
      }
    }
  );

  if (!paddleResponse.ok) {
    return new Response("Transaction could not be verified", {
      status: 403,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const payload = await paddleResponse.json();
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

  const objectKey = lang === "en" ? "the-helm-english.epub" : "shturval-ukrainian.epub";
  const epub = await env.BOOKS.get(objectKey);

  if (!epub) {
    return new Response("The EPUB file has not been uploaded to the private BOOKS bucket yet.", {
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
