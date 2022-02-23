import * as crpc from "../src/node";

describe("local connection pairs", () => {
  it("should create a connection over a local pair of streams", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {}
    });

    const left_writer = left.sink.getWriter();
    await left_writer.write(Buffer.from("abc"));
    const right_writer = right.sink.getWriter();
    await right_writer.write(Buffer.from("def"));

    await left_writer.close();
    await right_writer.close();

    expect((await right.source.getReader().read()).value).toEqual(
      Buffer.from("abc")
    );
    expect((await left.source.getReader().read()).value).toEqual(
      Buffer.from("def")
    );

    await expect(left.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Success
    });

    await expect(right.status).resolves.toEqual({
      code: crpc.CloseStatusCode.Success
    });
  });

  it("should close the connection if the sink aborts", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {}
    });

    await left.sink.getWriter().abort(new Error("failed"));

    await expect(left.status).resolves.toEqual(
      expect.objectContaining({
        code: crpc.CloseStatusCode.Error
      })
    );

    await expect(right.status).resolves.toEqual(
      expect.objectContaining({
        code: crpc.CloseStatusCode.Error
      })
    );
  });

  it("should close the connection if the source aborts", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {}
    });

    await left.source.getReader().cancel(new Error("failed"));

    await expect(left.status).resolves.toEqual(
      expect.objectContaining({
        code: crpc.CloseStatusCode.Error
      })
    );

    await expect(right.status).resolves.toEqual(
      expect.objectContaining({
        code: crpc.CloseStatusCode.Error
      })
    );
  });

  it("should close the connection by calling close", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {}
    });

    await left.abort();

    const status = {
      code: crpc.CloseStatusCode.Error,
      reason: "AbortError: The operation was aborted"
    };

    await expect(left.status).resolves.toEqual(status);
    await expect(right.status).resolves.toEqual(status);
  });
});
