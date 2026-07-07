import Docker from "dockerode";
import path from "node:path";

export const WORKER_RUNTIME_IMAGE = "botfleet-worker-runtime:latest";
export const WORKER_RUNTIME_DIR = path.join(process.cwd(), "worker-runtime");

let docker: Docker | undefined;

function getDocker(): Docker {
  if (!docker) {
    docker = new Docker();
  }
  return docker;
}

function containerName(botId: string): string {
  return `botfleet-bot-${botId}`;
}

async function findContainer(botId: string): Promise<Docker.Container | undefined> {
  const containers = await getDocker().listContainers({
    all: true,
    filters: { name: [containerName(botId)] },
  });
  const match = containers[0];
  return match ? getDocker().getContainer(match.Id) : undefined;
}

export async function dockerStartBotContainer(
  botId: string,
  env: Record<string, string>,
): Promise<void> {
  const existing = await findContainer(botId);
  if (existing) {
    await existing.remove({ force: true }).catch(() => undefined);
  }

  const container = await getDocker().createContainer({
    name: containerName(botId),
    Image: WORKER_RUNTIME_IMAGE,
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    HostConfig: { RestartPolicy: { Name: "on-failure", MaximumRetryCount: 5 } },
  });
  await container.start();
}

export async function dockerStopBotContainer(botId: string): Promise<void> {
  const container = await findContainer(botId);
  if (!container) return;
  await container.stop().catch(() => undefined);
  await container.remove({ force: true }).catch(() => undefined);
}

export async function dockerRestartBotContainer(botId: string): Promise<void> {
  const container = await findContainer(botId);
  if (!container) {
    throw new Error(`No container found for bot ${botId} - start it first.`);
  }
  await container.restart();
}
