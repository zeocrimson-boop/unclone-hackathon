import "dotenv/config";
import { createApp } from "./app.js";
const port = Number(process.env.PORT || 3000);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (
  !Number.isInteger(trustProxyHops) ||
  trustProxyHops < 0 ||
  trustProxyHops > 5
)
  throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
const server = createApp({ trustProxyHops }).listen(port, "0.0.0.0", () =>
  console.log(`EchoGuard listening on port ${port}`),
);
server.requestTimeout = 120000;
server.headersTimeout = 15000;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
