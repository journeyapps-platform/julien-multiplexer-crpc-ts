import * as connection from "../connection";
import * as stream from "stream/web";
import * as uuid from "uuid";

/**
 * Create an in-memory connection pair over two muxed streams.
 *
 * Note, this is a primitive implementation for the purpose of writing simple
 * tests and does not handle message framing
 */
export const createLocalConnectionPair = (
  params?: connection.CreateConnectionParams
): [connection.Connection, connection.Connection] => {
  const id = params?.id || uuid.v4();

  const left_sink = new stream.TransformStream();
  const left_source = new stream.TransformStream();

  const right_sink = new stream.TransformStream();
  const right_source = new stream.TransformStream();

  const left_connection = connection.create({
    id,
    metadata: params?.metadata,
    sink: left_sink.writable,
    source: right_sink.readable.pipeThrough(left_source)
  });

  const right_connection = connection.create({
    id,
    metadata: params?.metadata,
    sink: right_sink.writable,
    source: left_sink.readable.pipeThrough(right_source)
  });

  return [left_connection, right_connection];
};
