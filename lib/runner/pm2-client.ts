import pm2 from "pm2";
import path from "node:path";

/** Promisified wrapper around the callback-based `pm2` package. */

let connected = false;

async function ensureConnected(): Promise<void> {
  if (connected) return;
  await new Promise<void>((resolve, reject) => {
    pm2.connect((err) => (err ? reject(err) : resolve()));
  });
  connected = true;
}

export const WORKER_RUNTIME_SCRIPT = path.join(process.cwd(), "worker-runtime", "bot-process.js");

export async function pm2StartBotProcess(name: string, env: Record<string, string>): Promise<void> {
  await ensureConnected();
  await new Promise<void>((resolve, reject) => {
    pm2.start(
      { name, script: WORKER_RUNTIME_SCRIPT, env, autorestart: true, max_restarts: 5 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

export async function pm2StopProcess(name: string): Promise<void> {
  await ensureConnected();
  await new Promise<void>((resolve, reject) => {
    pm2.stop(name, (err) => (err ? reject(err) : resolve()));
  });
}

export async function pm2DeleteProcess(name: string): Promise<void> {
  await ensureConnected();
  await new Promise<void>((resolve) => {
    pm2.delete(name, () => resolve());
  });
}

export async function pm2RestartProcess(name: string): Promise<void> {
  await ensureConnected();
  await new Promise<void>((resolve, reject) => {
    pm2.restart(name, (err) => (err ? reject(err) : resolve()));
  });
}

export async function pm2Describe(name: string): Promise<pm2.ProcessDescription | undefined> {
  await ensureConnected();
  return new Promise((resolve, reject) => {
    pm2.describe(name, (err, list) => (err ? reject(err) : resolve(list?.[0])));
  });
}
