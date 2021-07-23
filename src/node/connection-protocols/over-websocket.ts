import * as connection from "../connection";
import * as WebSocket from "ws";

export const createConnectionFromWebSocket = (
  socket: WebSocket,
  params: connection.CreateConnectionParams
): connection.Connection => {
  const duplex = WebSocket.createWebSocketStream(socket);

  return connection.create({
    metadata: params.metadata,
    source: duplex,
    sink: duplex,
  });
};
