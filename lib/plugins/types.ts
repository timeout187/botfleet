import type { AlertSeverity } from "@/app/generated/prisma/client";
import type { CheckStatus } from "@/lib/security-checks";

export interface DashboardCardResult {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning" | "danger";
  detail?: string;
}

export interface DashboardCard {
  id: string;
  title: string;
  render(): Promise<DashboardCardResult>;
}

export interface HealthCheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface HealthCheckContribution {
  id: string;
  run(): Promise<HealthCheckResult>;
}

export interface AlertRuleResult {
  trigger: boolean;
  title?: string;
  message?: string;
  severity?: AlertSeverity;
}

export interface AlertRule {
  id: string;
  description: string;
  evaluate(): Promise<AlertRuleResult>;
}

export interface BotTemplate {
  id: string;
  name: string;
  runtime: string;
  description: string;
  code: string;
}

export interface DeploymentHooks {
  beforeDeploy?(): Promise<void>;
  afterDeploy?(): Promise<void>;
}

export interface BotFleetPlugin {
  id: string;
  name: string;
  description: string;
  dashboardCards?: DashboardCard[];
  healthChecks?: HealthCheckContribution[];
  alertRules?: AlertRule[];
  botTemplates?: BotTemplate[];
  deploymentHooks?: DeploymentHooks;
}
