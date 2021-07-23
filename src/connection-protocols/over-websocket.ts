import * as connection from "../connection";
import * as stream from "stream";
import * as WebSocket from "ws";

export const createConnectionFromWebSocket = (
  socket: WebSocket,
  params: connection.CreateConnectionParams
): connection.Connection => {
  const source = new stream.PassThrough();
  const sink = new stream.Writable({
    write(chunk, _, done) {
      socket.send(chunk, done);
    },
  });

  socket.on("message", (message) => {
    source.push(message);
  });

  const conn = connection.create({
    metadata: params.metadata,
    source,
    sink,
  });

  conn.close_status.then(() => {
    socket.close();
  });

  socket.on("error", () => {
    connection.close(conn);
  });

  socket.on("close", () => {
    connection.close(conn);
  });

  return conn;
};
