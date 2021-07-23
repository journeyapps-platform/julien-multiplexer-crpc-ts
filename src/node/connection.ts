import * as stream from "stream";
import * as uuid from "uuid";

export type ConnectionMetadata = Record<string, any> & {
  id?: string;
};

export enum CloseStatus {
  Error = "error",
  Success = "success",
}

export type Connection = {
  id: string;
  source: stream.Duplex;
  sink: stream.Writable;
  metadata: ConnectionMetadata;
  closed: boolean;
  close_status: Promise<CloseStatus>;
};

export type CreateConnectionParams = {
  metadata: ConnectionMetadata;
};

export const close = (connection: Connection, err?: Error) => {
  connection.closed = true;

  connection.source.end();
  connection.sink.end();
  connection.source.destroy(err);
  connection.sink.destroy(err);
};

type CreateConnectionFromStreamParams = CreateConnectionParams & {
  source: stream.Duplex;
  sink: stream.Writable;
};
export const create = (
  params: CreateConnectionFromStreamParams
): Connection => {
  let resolve: (status: CloseStatus) => void;
  const connection: Connection = {
    id: params.metadata.id || uuid.v4(),
    source: params.source,
    sink: params.sink,
    closed: false,
    close_status: new Promise((r) => {
      resolve = r;
    }),
    metadata: params.metadata,
  };

  const close = (status: CloseStatus, err?: Error) => {
    if (!params.sink.destroyed) {
      params.sink.destroy(err);
    }

    if (!params.source.destroyed) {
      params.source.destroy(err);
    }

    if (!params.sink.writable && !params.source.readable) {
      connection.closed = true;
      resolve(status);
    }
  };

  params.sink.once("end", () => close(CloseStatus.Success));
  params.source.once("end", () => close(CloseStatus.Success));
  params.sink.once("close", () => close(CloseStatus.Success));
  params.source.once("close", () => close(CloseStatus.Success));

  params.sink.once("error", (err) => close(CloseStatus.Error, err));
  params.source.once("error", (err) => close(CloseStatus.Error, err));

  return connection;
};
