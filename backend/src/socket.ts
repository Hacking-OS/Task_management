import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth.js";
import type { Notification } from "./types.js";

let io: Server | null = null;

function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const queryToken = socket.handshake.query?.token;
    const token =
      (typeof authToken === "string" && authToken) ||
      (typeof queryToken === "string" && queryToken) ||
      null;

    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    const userId = verifyToken(token);
    if (!userId) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
  });

  return io;
}

export function emitNotification(userId: string, notification: Notification, unreadCount: number): void {
  io?.to(userRoom(userId)).emit("notification:new", { notification, unreadCount });
}

export function emitUnreadSync(userId: string, unreadCount: number): void {
  io?.to(userRoom(userId)).emit("notification:sync", { unreadCount });
}

export function emitNotificationRemoved(userId: string, id: string, unreadCount: number): void {
  io?.to(userRoom(userId)).emit("notification:removed", { id, unreadCount });
}
