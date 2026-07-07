import { Queue } from "bullmq";
import { getQueueConnection } from "@/lib/queue/connection";

/**
 * Routes a command from an API route (running in the Next.js process) to
 * a specific agent's live WebSocket connection, which is held by the
 * separate agent-gateway process (`npm run agent-gateway`) - the same
 * cross-process problem `worker:ai` solves with a queue, reused here
 * rather than inventing a second mechanism. The agent-gateway process
 * runs a BullMQ Worker on this same queue (see
 * lib/agent-gateway/server.ts) that looks up its own in-memory connection
 * map and sends the message, or reports the command failed if that agent
 * isn't currently connected.
 */
export const AGENT_COMMAND_QUEUE_NAME = "botfleet-agent-commands";

export interface AgentCommandJobData {
  agentId: string;
  /** Already-constructed, fully-validated ControlPlaneToAgent envelope -
   * the queue is just a transport between processes, not another place
   * to build or validate messages. */
  message: unknown;
}

function createQueue() {
  return new Queue<AgentCommandJobData>(AGENT_COMMAND_QUEUE_NAME, {
    connection: getQueueConnection(),
  });
}

let queue: ReturnType<typeof createQueue> | undefined;

function getQueue() {
  if (!queue) {
    queue = createQueue();
  }
  return queue;
}

export async function enqueueAgentCommand(data: AgentCommandJobData): Promise<void> {
  await getQueue().add("send-command", data, {
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 3600 },
  });
}
