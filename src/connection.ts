import * as stream from "stream";
import * as uuid from "uuid";

export type ConnectionMetadata = Record<string, any> & {
  id?: string;
};

export type Connection = {
  id: string;
  source: stream.Duplex;
  sink: stream.Writable;
  metadata: ConnectionMetadata;
  closed: boolean;
};

export type CreateConnectionParams = {
  metadata: ConnectionMetadata;
};

export const close = (connection: Connection) => {
  connection.source.end();
  connection.sink.end();

  connection.source.destroy();
  connection.sink.destroy();
};

type CreateConnectionFromStreamParams = CreateConnectionParams & {
  metadata: ConnectionMetadata;
  source: stream.Duplex;
  sink: stream.Writable;
};
export const create = (
  params: CreateConnectionFromStreamParams
): Connection => {
  const connection: Connection = {
    id: params.metadata.id || uuid.v4(),
    source: params.source,
    sink: params.sink,
    closed: false,
    metadata: params.metadata,
  };

  params.sink.once("close", () => {
    connection.closed = true;
  });
  params.source.once("close", () => {
    connection.closed = true;
  });

  params.sink.once("close", params.source.destroy);
  params.sink.once("error", params.source.destroy);
  params.source.once("close", params.sink.destroy);
  params.source.once("error", params.sink.destroy);

  return connection;
};
