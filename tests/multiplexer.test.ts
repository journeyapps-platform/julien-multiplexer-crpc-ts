import * as crpc from "../src";
import "jest";

describe("multiplexer", () => {
  test("it should correctly derive connections from a multiplexer", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {},
    });

    const multiplexer_server = crpc.createMultiplexer(right);
    const multiplexer_client = crpc.createMultiplexer(left);

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
});
