import * as connection from "../connection";
import * as stream from "stream";
import * as uuid from "uuid";

/**
 * Create an in-memory connection pair over two muxed streams.
 *
 * Note, this is a primitive implementation for the purpose of writing simple
 * tests and does not handle message framing
 */
export const createLocalConnectionPair = (
  params: connection.CreateConnectionParams
) => {
  const sink = new stream.PassThrough();
  const source = new stream.PassThrough();

  const id = params.metadata.id || uuid.v4();
  const metadata = {
    id,
    ...params.metadata,
  };
  const left = connection.create({
    metadata: metadata,
    sink: sink,
    source: source,
  });
  const right = connection.create({
    metadata: metadata,
    sink: source,
    source: sink,
  });

  return [left, right];
};
