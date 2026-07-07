import { decryptSecret } from "@/lib/crypto";

export interface DiscordAlertPayload {
  title: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
}

const SEVERITY_COLOR: Record<DiscordAlertPayload["severity"], number> = {
  info: 0x5865f2,
  warning: 0xf5a623,
  error: 0xed4245,
  critical: 0x992d22,
};

/**
 * Sends an alert to a Discord webhook as an embed. Mass mentions are always
 * disabled (allowed_mentions.parse = []) so a flood of alerts can never
 * @everyone/@here a customer's server.
 */
export async function sendDiscordAlert(
  webhookUrlEncrypted: string,
  payload: DiscordAlertPayload,
): Promise<{ ok: boolean; status: number }> {
  const url = decryptSecret(webhookUrlEncrypted);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: payload.title,
          description: payload.message,
          color: SEVERITY_COLOR[payload.severity],
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [] },
    }),
  });
  return { ok: res.ok, status: res.status };
}
