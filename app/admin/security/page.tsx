import { runSecurityChecks } from "@/lib/security-checks";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SecurityPage() {
  const report = await runSecurityChecks();

  const scoreTone = report.score >= 90 ? "success" : report.score >= 60 ? "warning" : "danger";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-50">Security Center</h1>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Security score
            </div>
            <div
              className={`mt-1 text-4xl font-semibold ${
                scoreTone === "success"
                  ? "text-emerald-400"
                  : scoreTone === "warning"
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            >
              {report.score}%
            </div>
          </div>
          <div className="text-right text-sm text-zinc-400">
            <div>{report.actionRequired.length} action(s) required</div>
            <div>{report.warnings.length} warning(s)</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All checks</CardTitle>
        </CardHeader>
        <div className="divide-y divide-zinc-800">
          {report.checks.map((check) => (
            <div key={check.id} className="flex items-start justify-between gap-4 py-3 text-sm">
              <div>
                <div className="font-medium text-zinc-200">{check.label}</div>
                <div className="text-xs text-zinc-500">{check.detail}</div>
              </div>
              <Badge
                variant={
                  check.status === "pass" ? "success" : check.status === "warn" ? "warning" : "danger"
                }
              >
                {check.status === "pass" ? "Pass" : check.status === "warn" ? "Warning" : "Action required"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
