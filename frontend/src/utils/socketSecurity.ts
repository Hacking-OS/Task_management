import type { Socket } from "socket.io-client";

export interface SocketSubscribeAck {
  ok: boolean;
  error?: string;
  securityVersion?: number;
}

/** Subscribe to workspace channel — server validates membership + session. */
export function subscribeWorkspace(socket: Socket, workspaceId: string): Promise<SocketSubscribeAck> {
  return new Promise((resolve) => {
    socket.emit("workspace:subscribe", workspaceId, (ack: SocketSubscribeAck | undefined) => {
      resolve(ack ?? { ok: false, error: "No response from server" });
    });
  });
}

/** Subscribe to team channel — server validates team membership + session. */
export function subscribeTeam(socket: Socket, teamId: string): Promise<SocketSubscribeAck> {
  return new Promise((resolve) => {
    socket.emit("team:subscribe", teamId, (ack: SocketSubscribeAck | undefined) => {
      resolve(ack ?? { ok: false, error: "No response from server" });
    });
  });
}

export function unsubscribeWorkspace(socket: Socket, workspaceId: string): void {
  socket.emit("workspace:unsubscribe", workspaceId);
}

export function unsubscribeTeam(socket: Socket, teamId: string): void {
  socket.emit("team:unsubscribe", teamId);
}

export function requestSecurityRevalidate(socket: Socket): void {
  socket.emit("security:revalidate");
}

export function isSocketAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("unauthorized") || m.includes("session revoked") || m.includes("session invalid");
}
