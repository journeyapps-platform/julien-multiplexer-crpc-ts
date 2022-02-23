import * as connection from "../../connection";
import * as encoder from "./encoder";
import * as decoder from "./decoder";

export const createBSONFramedConnection = <I = {}, O = {}>(
  conn: connection.Connection<Buffer, Buffer>
): connection.Connection<I, O> => {
  const sink = encoder.createBSONStreamEncoder();
  sink.readable.pipeTo(conn.sink).catch(() => {});

  return connection.create({
    id: conn.id,
    metadata: conn.metadata,
    source: conn.source.pipeThrough(decoder.createBSONStreamDecoder()),
    sink: sink.writable
  });
};
