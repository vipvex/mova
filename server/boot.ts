// MUST be imported FIRST (before pg/openai/s3 clients are constructed). On machines with a
// broken/partial IPv6 stack, Node resolves hostnames to IPv6 (AAAA) first and outbound
// connects fail with EADDRNOTAVAIL / "Request timed out" — which was silently killing slow
// image generations (and once crashed the server). Preferring IPv4 avoids the dead IPv6 path.
import dns from "node:dns";
try { dns.setDefaultResultOrder("ipv4first"); } catch { /* older node: ignore */ }
