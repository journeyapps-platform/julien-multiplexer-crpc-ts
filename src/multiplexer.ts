import * as connection from "./connection";
import * as stream from "stream";
import * as bson from "bson";
import * as uuid from "uuid";

enum PacketType {
  Create = "create",
  Data = "data",
  Close = "close",
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
  data: Buffer;
};

type ClosePacket = CorrelationId & {
  type: PacketType.Close;
};

type Packet = CreatePacket | DataPacket | ClosePacket;

export type Multiplexer = {
  connections: AsyncIterator<connection.Connection>;
  createConnection: (
    params: connection.CreateConnectionParams
  ) => connection.Connection;
};

const write = async (stream: stream.Writable, data: any) => {
  if (stream.writableLength >= stream.writableHighWaterMark) {
    await new Promise<void>((resolve) => {
      const _resolve = () => {
        stream.off("drain", _resolve);
        stream.off("end", _resolve);
        resolve();
      };
      stream.once("drain", _resolve);
      stream.once("end", _resolve);
    });
  }
  stream.write(data);
};

const writePacket = (stream: stream.Writable, packet: Packet) => {
  return write(stream, packet);
};

export const createDataPacketWritable = (sink: stream.Writable, id: string) => {
  return new stream.Writable({
    async write(chunk, _, done) {
      await writePacket(sink, {
        id: id,

        type: PacketType.Data,
        data: chunk,
      });
      done();
    },
    final(done) {
      writePacket(sink, {
        id: id,

        type: PacketType.Close,
      });
      done();
    },
  });
};

export const createMultiplexer = (
  transport: connection.Connection
): Multiplexer => {
  const connections = new Map<string, connection.Connection>();

  const new_connections = new stream.PassThrough({
    objectMode: true,
  });

  const sink = new stream.Transform({
    writableObjectMode: true,
    transform(chunk: Packet, _, done) {
      done(null, bson.serialize(chunk));
    },
  });

  stream.pipeline(sink, transport.sink, () => {});

  stream.pipeline(
    transport.source,
    new stream.Transform({
      readableObjectMode: true,
      transform(chunk, _, done) {
        done(
          null,
          bson.deserialize(chunk, {
            promoteBuffers: true,
          })
        );
      },
    }),
    new stream.Writable({
      objectMode: true,
      async write(packet: Packet, _, done) {
        try {
          switch (packet.type) {
            case PacketType.Create: {
              const new_connection = connection.create({
                metadata: {
                  id: packet.id,
                  ...packet.metadata,
                },

                source: new stream.PassThrough(),
                sink: createDataPacketWritable(sink, packet.id),
              });

              connections.set(packet.id, new_connection);
              new_connections.write(new_connection);
              return;
            }

            case PacketType.Data: {
              const connection = connections.get(packet.id);
              if (!connection) {
                return;
              }
              await write(connection.source, packet.data);
              return;
            }

            case PacketType.Close: {
              const conn = connections.get(packet.id);
              if (!conn) {
                return;
              }
              connection.close(conn);
              connections.delete(packet.id);
              return;
            }
          }
        } finally {
          done();
        }
      },
    }),
    () => {}
  );

  return {
    connections: new_connections[Symbol.asyncIterator](),
    createConnection: (params) => {
      const id = uuid.v4();

      const conn = connection.create({
        sink: createDataPacketWritable(sink, id),
        source: new stream.PassThrough(),
        metadata: {
          id: id,
          ...params.metadata,
        },
      });
      connections.set(id, conn);

      writePacket(sink, {
        id: id,

        type: PacketType.Create,
        metadata: params.metadata,
      });

      return conn;
    },
  };
};

export const takeNextConnection = async (multiplexer: Multiplexer) => {
  const next = await multiplexer.connections.next();
  if (next.done === true) {
    return null;
  }
  return next.value;
};
