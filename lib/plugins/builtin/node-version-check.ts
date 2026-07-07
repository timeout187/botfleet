import type { BotFleetPlugin } from "@/lib/plugins/types";

const MIN_MAJOR = 20;

export const nodeVersionCheckPlugin: BotFleetPlugin = {
  id: "node-version-check",
  name: "Node.js Version Check",
  description: "Extends the Security Center with a check outside BotFleet's own built-in list.",
  healthChecks: [
    {
      id: "node-version",
      async run() {
        const major = Number(process.versions.node.split(".")[0]);
        const ok = major >= MIN_MAJOR;
        return {
          id: "node-version",
          label: "Node.js version",
          status: ok ? "pass" : "warn",
          detail: ok
            ? `Running Node.js ${process.versions.node} (>= ${MIN_MAJOR} required).`
            : `Running Node.js ${process.versions.node}; BotFleet requires >= ${MIN_MAJOR}.`,
        };
      },
    },
  ],
};
