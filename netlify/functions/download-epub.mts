import { getStore } from "@netlify/blobs";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

const PRICE_ID = "pri_01m46e7pfh0j9fhw85zvazb6pt";
const PADDLE_API_URL = "https://sandbox-api.paddle.com";

export default async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const transactionId = new URL(req.url).searchParams.get("transaction_id");
  if (!transactionId || !/^txn_[a-z0-9]{26}$/.test(transactionId)) {
    return new Response("Invalid transaction", { status: 400 });
  }

  const apiKey = Netlify.env.get("PADDLE_API_KEY");
  if (!apiKey) {
    return new Response("Fulfillment is not configured", { status: 503 });
  }

  const paddleResponse = await fetch(
    `${PADDLE_API_URL}/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Paddle-Version": "1",
      },
    },
  );

  if (!paddleResponse.ok) {
    return new Response("Transaction could not be verified", { status: 403 });
  }

  const payload = await paddleResponse.json();
  const transaction = payload?.data;

  if (!transaction || transaction.status !== "completed") {
    return new Response("Payment is not completed", { status: 403 });
  }

  const hasBookPrice = Array.isArray(transaction.items)
    && transaction.items.some((item: { price?: { id?: string } }) => item?.price?.id === PRICE_ID);

  if (!hasBookPrice) {
    return new Response("Transaction does not contain the book", { status: 403 });
  }

  const store = getStore("shturval-fulfillment");
  const epub = await store.get("shturval-ukrainian.epub", { type: "arrayBuffer" });

  if (!epub) {
    return new Response("EPUB is not uploaded yet", { status: 503 });
  }

  return new Response(epub, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": 'attachment; filename="SHTURVAL_Ukrainian.epub"; filename*=UTF-8\'\'SHTURVAL%20%E2%80%94%20%D1%83%D0%BA%D1%80%D0%B0%D1%97%D0%BD%D1%81%D1%8C%D0%BA%D0%B0%20%D0%B2%D0%B5%D1%80%D1%81%D1%96%D1%8F.epub"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const config = {
  path: "/download-epub",
};
