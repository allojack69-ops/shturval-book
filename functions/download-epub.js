export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transaction_id");
  const lang = url.searchParams.get("lang") === "en" ? "en" : "uk";

  if (!transactionId || !/^txn_[a-z0-9]{26}$/.test(transactionId)) {
    return new Response("Invalid transaction", {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (!env.PADDLE_API_KEY || !env.BOOKS) {
    console.error("EPUB delivery configuration missing", {
      hasApiKey: Boolean(env.PADDLE_API_KEY),
      hasBooksBinding: Boolean(env.BOOKS)
    });
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
  } catch (error) {
    console.error("Paddle request failed before receiving a response", {
      errorName: error?.name || "UnknownError"
    });
    return new Response("Could not verify payment with Paddle. Please try again later.", {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (!paddleResponse.ok) {
    let errorCode = "unavailable";
    let errorType = "unknown";
    try {
      const errorPayload = await paddleResponse.json();
      const firstError = errorPayload?.error || errorPayload?.errors?.[0] || errorPayload?.data?.error;
      if (typeof firstError?.code === "string") errorCode = firstError.code;
      if (typeof firstError?.type === "string") errorType = firstError.type;
    } catch {
      // Do not log the response body or credentials.
    }

    console.error("Paddle transaction verification rejected", {
      httpStatus: paddleResponse.status,
      errorCode,
      errorType
    });

    return new Response("Transaction could not be verified", {
      status: 403,
      headers: { "Cache-Control": "no-store" }
    });
  }

  let payload;
  try {
    payload = await paddleResponse.json();
  } catch {
    console.error("Paddle returned a successful status with invalid JSON");
    return new Response("Invalid response from payment provider", {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const transaction = payload?.data;
  if (!transaction || transaction.status !== "completed") {
    console.error("Paddle transaction is not completed", {
      status: transaction?.status || "missing"
    });
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
    console.error("Completed Paddle transaction does not match requested edition", { lang });
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
  } catch (error) {
    console.error("R2 EPUB read failed", {
      errorName: error?.name || "UnknownError",
      lang
    });
    return new Response("Could not read the EPUB from storage. Please contact the author.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (!epub) {
    console.error("Expected EPUB object missing from R2", { lang, objectKey });
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
