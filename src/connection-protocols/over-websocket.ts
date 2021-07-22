import * as connection from "../connection";
import * as stream from "stream";
import * as WebSocket from "ws";
import * as uuid from "uuid";

export const createConnectionFromWebSocket = (
  socket: WebSocket,
  params: connection.CreateConnectionParams
): connection.Connection => {
  const id = params.metadata.id || uuid.v4();
  const metadata = {
    id,
    ...params.metadata,
  };

  const source = new stream.PassThrough();
  const sink = new stream.Writable({
    write(chunk, _, done) {
      socket.send(chunk, done);
    },
  });

  socket.on("message", (message) => {
    source.push(message);
  });

  return {
    id,
    metadata,
    closed: false,
    source,
    sink,
  };
};
