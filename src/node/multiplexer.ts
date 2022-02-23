import * as connection from "./connection";
import * as stream from "stream/web";
import * as uuid from "uuid";

enum PacketType {
  Create = "create",
  Data = "data",
  Close = "close"
}

type CorrelationId = {
  id: string;
};

type CreatePacket = CorrelationId & {
  type: PacketType.Create;
  metadata: connection.ConnectionMetadata;
};

type DataPacket = CorrelationId & {
  type: PacketType.Data;
  data: Buffer | null;
};

type ClosePacket = CorrelationId & {
  type: PacketType.Close;
  status: connection.CloseStatus;
};

type Packet = CreatePacket | DataPacket | ClosePacket;

export type Multiplexer = {
  connections: AsyncIterator<connection.Connection>;
  createConnection: (
    params?: connection.CreateConnectionParams
  ) => Promise<connection.Connection>;
};

export const createDataPacketWritable = (
  sink: stream.WritableStreamDefaultWriter<Packet>,
  id: string
) => {
  return new stream.WritableStream<Buffer>({
    async write(chunk) {
      return sink.write({
        id: id,

        type: PacketType.Data,
        data: chunk
      });
    },
    close() {
      return sink.write({
        id: id,

        type: PacketType.Data,
        data: null
      });
    },
    abort(err) {
      return sink
        .write({
          id: id,

          type: PacketType.Close,
          status: {
            code: connection.CloseStatusCode.Error,
            reason: err?.toString()
          }
        })
        .catch(() => {});
    }
  });
};

type ActiveConnection = {
  connection: connection.Connection;
  sink: stream.WritableStreamDefaultWriter<Buffer>;
};

export const createMultiplexer = (
  transport: connection.Connection<Packet, Packet>
): Multiplexer => {
  const incoming_connections = new stream.TransformStream();
  const active_connections = new Map<string, ActiveConnection>();

  const appendIncomingConnection = (conn: connection.Connection) => {
    const writer = incoming_connections.writable.getWriter();
    writer.write(conn);
    writer.releaseLock();
  };

  const sink = transport.sink.getWriter();

  transport.source
    .pipeTo(
      new stream.WritableStream({
        async write(packet) {
          switch (packet.type) {
            case PacketType.Create: {
              const source = new stream.TransformStream();

              const new_connection = connection.create({
                id: packet.id,
                metadata: packet.metadata,

                source: source.readable,
                sink: createDataPacketWritable(sink, packet.id)
              });

              new_connection.status.then((status) => {
                active_connections.delete(new_connection.id);
                sink
                  .write({
                    id: new_connection.id,

                    type: PacketType.Close,
                    status: status
                  })
                  .catch(() => {});
              });

              active_connections.set(packet.id, {
                connection: new_connection,
                sink: source.writable.getWriter()
              });

              appendIncomingConnection(new_connection);
              return;
            }

            case PacketType.Data: {
              const active_connection = active_connections.get(packet.id);
              if (!active_connection) {
                return;
              }
              if (packet.data === null) {
                if (active_connection.connection.source_closed) {
                  return;
                }
                await active_connection.sink.close();
                return;
              }
              await active_connection.sink.write(packet.data);
              return;
            }

            case PacketType.Close: {
              const active_connection = active_connections.get(packet.id);
              if (!active_connection) {
                return;
              }

              if (!active_connection.connection.closed) {
                await active_connection.connection.abort();
                await active_connection.connection.status;
              }

              active_connections.delete(packet.id);
              return;
            }
          }
        }
      })
    )
    .finally(async () => {
      await incoming_connections.writable.abort().catch(() => {});
      for (const { connection } of active_connections.values()) {
        connection.abort().catch(() => {});
      }
    });

  return {
    /**
     * This is being ignored due to issues in the @types/node types package which does not include the .values() API
     */
    // @ts-ignore
    connections: incoming_connections.readable.values(),

    createConnection: async (params) => {
      const id = uuid.v4();

      const source = new stream.TransformStream();

      const new_connection = connection.create({
        sink: createDataPacketWritable(sink, id),
        source: source.readable,
        metadata: params?.metadata
      });
      active_connections.set(id, {
        connection: new_connection,
        sink: source.writable.getWriter()
      });

      await sink.write({
        id: id,

        type: PacketType.Create,
        metadata: params?.metadata || {}
      });

      new_connection.status.then((status) => {
        active_connections.delete(new_connection.id);
        sink
          .write({
            id: id,

            type: PacketType.Close,
            status: status
          })
          .catch(() => {});
      });

      return new_connection;
    }
  };
};

export const takeNextConnection = async (multiplexer: Multiplexer) => {
  const next = await multiplexer.connections.next();
  if (next.done === true) {
    throw new Error("No more connections available");
  }
  return next.value;
};
