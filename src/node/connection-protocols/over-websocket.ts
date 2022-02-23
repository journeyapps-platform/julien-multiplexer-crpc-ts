import * as connection from "../connection";
import * as stream from "stream/web";
import * as utils from "../utils";
import * as WebSocket from "ws";

export const createConnectionFromWebSocket = (
  socket: WebSocket,
  params: connection.CreateConnectionParams
): connection.Connection => {
  const duplex = WebSocket.createWebSocketStream(socket);

  const sink = new stream.WritableStream<Buffer>({
    write(chunk) {
      duplex.write(chunk);
    },
    close() {
      duplex.end();
    },
    abort(err) {
      duplex.destroy(err);
    }
  });

  return connection.create({
    metadata: params.metadata,
    source: utils.readableFrom(duplex),
    sink: sink
  });
};
