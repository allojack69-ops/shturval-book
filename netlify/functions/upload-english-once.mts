import { getStore } from "@netlify/blobs";

const ONE_TIME_TOKEN = "TtMmVVlbzWpvdXBg-jQb44LRgHICEl5O";

export default async (req: Request) => {
  if (req.method !== "PUT") return new Response("Method not allowed", { status: 405 });
  const token = new URL(req.url).searchParams.get("token");
  if (token !== ONE_TIME_TOKEN) return new Response("Unauthorized", { status: 401 });

  const body = await req.arrayBuffer();
  if (!body.byteLength) return new Response("Empty file", { status: 400 });

  const store = getStore("shturval-fulfillment");
  await store.set("shturval-english.epub", body, {
    metadata: { contentType: "application/epub+zip" },
  });

  return Response.json({ ok: true, size: body.byteLength });
};

export const config = { path: "/upload-english-once" };
