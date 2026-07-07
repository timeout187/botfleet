import net from "node:net";

export interface LocalMessage {
  type: string;
  payload: unknown;
}

export interface SocketClientOptions {
  socketPath: string;
  maxQueueSize?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Connects to the agent's local Unix socket IPC server
 * (apps/agent/src/local-ipc.ts) and never lets a connection problem
 * become a bot-process crash: connect errors are swallowed, disconnects
 * trigger an exponential-backoff reconnect (capped at 10s), and messages
 * sent while disconnected go into a small bounded queue (oldest dropped
 * first) rather than growing unbounded or throwing.
 */
export class AgentSocketClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private queue: LocalMessage[] = [];
  private reconnectAttempt = 0;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SocketClientOptions) {}

  connect(): void {
    this.closed = false;
    this.attemptConnect();
  }

  private attemptConnect(): void {
    if (this.closed) return;
    const socket = net.createConnection(this.options.socketPath);
    this.socket = socket;

    socket.on("connect", () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.options.onConnect?.();
      this.flushQueue();
    });

    socket.on("error", () => {
      // "close" fires right after and handles reconnect scheduling - a
      // bot process must never crash because its local IPC socket had a
      // hiccup (agent not started yet, agent restarting, ...).
    });

    socket.on("close", () => {
      this.connected = false;
      this.socket = null;
      this.options.onDisconnect?.();
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempt++);
      this.reconnectTimer = setTimeout(() => this.attemptConnect(), delay);
    });
  }

  send(message: LocalMessage): void {
    if (this.connected && this.socket) {
      this.socket.write(JSON.stringify(message) + "\n");
      return;
    }
    const maxQueueSize = this.options.maxQueueSize ?? 100;
    this.queue.push(message);
    while (this.queue.length > maxQueueSize) {
      this.queue.shift();
    }
  }

  private flushQueue(): void {
    if (!this.socket) return;
    for (const message of this.queue) {
      this.socket.write(JSON.stringify(message) + "\n");
    }
    this.queue = [];
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.end();
  }
}
