import os from "node:os";
import type { AgentCapability, AgentLabels } from "@botfleet/protocol";

function parseLabels(raw: string | undefined): AgentLabels {
  if (!raw) return {};
  const labels: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (key && value) labels[key] = value;
  }
  return labels;
}

/** Defaults to `["node", "custom-executable"]` - `node` because that's
 * what this agent's workload-runner.ts actually executes today (the
 * only implemented runtime type), so an unconfigured agent is genuinely
 * schedulable for a `runner.type: "node"` workload out of the box, not
 * silently ineligible for everything until an operator remembers to set
 * this env var. */
function parseCapabilities(raw: string | undefined): AgentCapability[] {
  if (!raw) return ["node", "custom-executable"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AgentCapability[];
}

export interface AgentConfig {
  controlPlaneUrl: string;
  enrollmentToken: string | undefined;
  agentName: string;
  labels: AgentLabels;
  capabilities: AgentCapability[];
  stateFilePath: string;
  localSocketPath: string;
  agentVersion: string;
}

export function loadConfig(): AgentConfig {
  const controlPlaneUrl = process.env.BOTFLEET_CONTROL_PLANE_WS_URL;
  if (!controlPlaneUrl) {
    throw new Error(
      "BOTFLEET_CONTROL_PLANE_WS_URL is not set (e.g. ws://localhost:4010) - see docs/agent-installation.md.",
    );
  }

  return {
    controlPlaneUrl,
    enrollmentToken: process.env.BOTFLEET_AGENT_ENROLLMENT_TOKEN,
    agentName: process.env.BOTFLEET_AGENT_NAME ?? os.hostname(),
    labels: parseLabels(process.env.BOTFLEET_AGENT_LABELS),
    capabilities: parseCapabilities(process.env.BOTFLEET_AGENT_CAPABILITIES),
    stateFilePath: process.env.BOTFLEET_AGENT_STATE_PATH ?? "./botfleet-agent-state.json",
    localSocketPath: process.env.BOTFLEET_AGENT_SOCKET_PATH ?? "/tmp/botfleet-agent.sock",
    agentVersion: "0.1.0",
  };
}
