import { createServer } from "node:http";
import { handle, inspect } from "./lab.mjs";

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let result;

  try {
    if (req.method !== "GET") {
      result = { status: 405, body: { error: "Use GET" } };
    } else if (url.pathname === "/__metrics") {
      result = { status: 200, body: { domain: inspect() } };
    } else {
      result = await handle({ url });
    }
  } catch (error) {
    result = { status: 500, body: { error: error.message } };
  }

  if (res.destroyed) return;
  res.writeHead(result.status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(result.body));
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "127.0.0.1", () => {
  console.log(`POC server: http://127.0.0.1:${port}/work`);
});
