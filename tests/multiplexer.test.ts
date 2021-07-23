import * as crpc from "../src/node";
import "jest";

describe("multiplexer", () => {
  test("it should correctly derive connections from a multiplexer", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {},
    });

    const multiplexer_client = crpc.createMultiplexer(
      crpc.createBsonFramedConnection(left)
    );
    const multiplexer_server = crpc.createMultiplexer(
      crpc.createBsonFramedConnection(right)
    );

    const testBiDirectionalCommunication = async (
      mux_left: crpc.Multiplexer,
      mux_right: crpc.Multiplexer
    ) => {
      const left_connection = crpc.createConnectionFromMultiplexer(mux_left, {
        metadata: {},
      });

      const right_connection = await crpc.takeNextConnection(mux_right);
      if (!right_connection) {
        throw new Error("right connection not present");
      }

      expect(left_connection).toBeTruthy();
      expect(right_connection).toBeTruthy();

      const left_data = "some left->right data";
      left_connection.sink.write(Buffer.from(left_data));

      const incoming_data = await right_connection.source.read();
      expect(incoming_data.toString()).toEqual(left_data);

      const right_data = "some right->left data";
      right_connection.sink.write(Buffer.from(right_data));

      const response_data = await left_connection!.source.read();
      expect(response_data.toString()).toEqual(right_data);

      crpc.close(left_connection);

      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(left_connection.closed).toBe(true);
      expect(right_connection.closed).toBe(true);
    };

    // client->server connection
    await testBiDirectionalCommunication(
      multiplexer_client,
      multiplexer_server
    );

    // server->client connection
    await testBiDirectionalCommunication(
      multiplexer_server,
      multiplexer_client
    );
  });

  test("sending EOF should end streams without closing connection", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {},
    });

    const multiplexer_client = crpc.createMultiplexer(
      crpc.createBsonFramedConnection(left)
    );
    const multiplexer_server = crpc.createMultiplexer(
      crpc.createBsonFramedConnection(right)
    );

    const left_connection = crpc.createConnectionFromMultiplexer(
      multiplexer_client,
      {
        metadata: {},
      }
    );

    const right_connection = await crpc.takeNextConnection(multiplexer_server);
    if (!right_connection) {
      throw new Error("right connection not present");
    }

    const left_data = "some left->right data";
    left_connection.sink.write(Buffer.from(left_data));
    left_connection.sink.end();

    const chunks = [];
    for await (const chunk of right_connection.source) {
      chunks.push(chunk);
    }

    const incoming_data = Buffer.concat(chunks);
    expect(incoming_data.toString()).toEqual(left_data);
    expect(right_connection.source.readable).toBe(false);

    right_connection.sink.end();

    const left_chunks = [];
    for await (const chunk of left_connection.source) {
      left_chunks.push(chunk);
    }

    expect(left_chunks.length).toBe(0);
    expect(left_connection.source.readable).toBe(false);

    expect(left_connection.closed).toBe(true);
    expect(right_connection.closed).toBe(true);

    await expect(left_connection.close_status).resolves.toBe(
      crpc.CloseStatus.Success
    );
    await expect(right_connection.close_status).resolves.toBe(
      crpc.CloseStatus.Success
    );
  });
});
