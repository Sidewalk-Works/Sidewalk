import { isIP } from "node:net";

/**
 * The identity a client address is limited under. IPv4 stays as it is, and an IPv4-mapped IPv6 address
 * (`::ffff:203.0.113.5`, which is how a dual-stack socket reports IPv4) is the same client as `203.0.113.5`.
 * IPv6 is reduced to its /64: one connection normally controls an entire /64, so limiting per full address would
 * let a single client rotate through billions of addresses and never meet a limit.
 */
export function rateLimitAddress(ip: string | undefined): string {
  if (!ip) return "unknown";
  let value = ip.trim().toLowerCase();
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped && isIP(mapped[1] as string) === 4) return mapped[1] as string;
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes(".")) return "unknown";

  let groups: string[];
  if (value.includes("::")) {
    const [head = "", tail = ""] = value.split("::");
    const before = head ? head.split(":") : [];
    const after = tail ? tail.split(":") : [];
    groups = [...before, ...Array<string>(8 - before.length - after.length).fill("0"), ...after];
  } else {
    groups = value.split(":");
  }
  if (groups.length !== 8) return "unknown";
  const padded = groups.map((g) => g.padStart(4, "0"));
  // The hexadecimal spelling of an IPv4-mapped address (::ffff:cb00:7105).
  if (padded.slice(0, 5).every((g) => g === "0000") && padded[5] === "ffff") {
    const hi = parseInt(padded[6] as string, 16);
    const lo = parseInt(padded[7] as string, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${padded.slice(0, 4).join(":")}::/64`;
}
