import type { BadgeVariant } from "@/components/ui/badge";

const BOT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  online: "success",
  offline: "neutral",
  starting: "info",
  stopping: "info",
  failed: "danger",
  disabled: "neutral",
  expired: "warning",
  rate_limited: "warning",
};

const WORKER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  online: "success",
  offline: "neutral",
  overloaded: "warning",
  failed: "danger",
  draining: "info",
};

const SHARD_STATUS_VARIANT: Record<string, BadgeVariant> = {
  connected: "success",
  connecting: "info",
  disconnected: "neutral",
  reconnecting: "warning",
};

const ALERT_SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  info: "info",
  warning: "warning",
  error: "danger",
  critical: "danger",
};

const AGENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  enrolling: "info",
  online: "success",
  degraded: "warning",
  disconnected: "neutral",
  draining: "info",
  maintenance: "warning",
  disabled: "neutral",
};

export function botStatusVariant(status: string): BadgeVariant {
  return BOT_STATUS_VARIANT[status] ?? "neutral";
}

export function workerStatusVariant(status: string): BadgeVariant {
  return WORKER_STATUS_VARIANT[status] ?? "neutral";
}

export function shardStatusVariant(status: string): BadgeVariant {
  return SHARD_STATUS_VARIANT[status] ?? "neutral";
}

export function alertSeverityVariant(status: string): BadgeVariant {
  return ALERT_SEVERITY_VARIANT[status] ?? "neutral";
}

export function agentStatusVariant(status: string): BadgeVariant {
  return AGENT_STATUS_VARIANT[status] ?? "neutral";
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
