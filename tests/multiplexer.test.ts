import * as crpc from "../src/node";

describe("multiplexer", () => {
  it("should correctly derive connections from a multiplexer", async () => {
    const [left, right] = crpc.createLocalConnectionPair();

    const multiplexer_client = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(left)
    );
    const multiplexer_server = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(right)
    );

    const testBiDirectionalCommunication = async (
      mux_left: crpc.Multiplexer,
      mux_right: crpc.Multiplexer
    ) => {
      const left_connection = await mux_left.createConnection();

      const right_connection = await crpc.takeNextConnection(mux_right);

      expect(left_connection).toBeTruthy();
      expect(right_connection).toBeTruthy();

      const left_data = "some left->right data";
      const left_writer = left_connection.sink.getWriter();
      await left_writer.write(Buffer.from(left_data));
      await left_writer.close();

      const incoming_data = await right_connection.source.getReader().read();
      expect(incoming_data.value?.toString()).toEqual(left_data);

      const right_data = "some right->left data";
      const right_writer = right_connection.sink.getWriter();
      await right_writer.write(Buffer.from(right_data));
      await right_writer.close();

      const response_data = await left_connection.source.getReader().read();
      expect(response_data.value?.toString()).toEqual(right_data);

      await expect(left_connection.status).resolves.toEqual({
        code: crpc.CloseStatusCode.Success
      });
      await expect(right_connection.status).resolves.toEqual({
        code: crpc.CloseStatusCode.Success
      });

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

  it("closing a single stream should not close the connection", async () => {
    const [left, right] = crpc.createLocalConnectionPair();

    const multiplexer_client = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(left)
    );
    const multiplexer_server = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(right)
    );

    const left_connection = await multiplexer_client.createConnection();
    const right_connection = await crpc.takeNextConnection(multiplexer_server);

    const left_data = "some left->right data";
    const writer = left_connection.sink.getWriter();
    await writer.write(Buffer.from(left_data));
    await writer.close();

    const chunks = [];
    for await (const chunk of right_connection.source) {
      chunks.push(chunk);
    }

    await right_connection.source_status;

    const incoming_data = Buffer.concat(chunks);
    expect(incoming_data.toString()).toEqual(left_data);
    expect(right_connection.source_closed).toBe(true);
    expect(right_connection.sink_closed).toBe(false);
    expect(right_connection.closed).toBe(false);

    await right_connection.sink.getWriter().close();

    const left_chunks = [];
    for await (const chunk of left_connection.source) {
      left_chunks.push(chunk);
    }

    await left_connection.status;

    expect(left_chunks.length).toBe(0);
    expect(left_connection.source_closed).toBe(true);

    expect(left_connection.closed).toBe(true);
    expect(right_connection.closed).toBe(true);

    await expect(left_connection.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Success
    });
    await expect(right_connection.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Success
    });
  });

  it("should close the connection if any stream errors", async () => {
    const [left, right] = crpc.createLocalConnectionPair();

    const multiplexer_client = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(left)
    );
    const multiplexer_server = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(right)
    );

    const left_connection = await multiplexer_client.createConnection();
    const right_connection = await crpc.takeNextConnection(multiplexer_server);

    const left_connection2 = await multiplexer_client.createConnection();
    const right_connection2 = await crpc.takeNextConnection(multiplexer_server);

    await left_connection.sink.getWriter().abort("Failed");
    await expect(left_connection.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Error,
      reason: "AbortError: The operation was aborted"
    });
    await expect(right_connection.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Error,
      reason: "AbortError: The operation was aborted"
    });

    await right_connection2.source.getReader().cancel("Failed");
    await expect(left_connection2.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Error,
      reason: "AbortError: The operation was aborted"
    });
    await expect(right_connection2.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Error,
      reason: "Failed"
    });
  });

  xit("should close active connections if the underlying transport closes", async () => {
    const [left, right] = crpc.createLocalConnectionPair();

    const multiplexer_client = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(left)
    );
    const multiplexer_server = crpc.createMultiplexer(
      crpc.bson.createBSONFramedConnection(right)
    );

    const left_connection = await multiplexer_client.createConnection();
    const right_connection = await crpc.takeNextConnection(multiplexer_server);

    await left.abort();

    const status = {
      code: crpc.CloseStatusCode.Error,
      reason: "Underlying transport closed unexpectedly"
    };
    await expect(left_connection.status).resolves.toEqual(status);
    await expect(right_connection.status).resolves.toEqual(status);
  });
});
