import * as crpc from "../src";
import "jest";

describe("local connection pairs", () => {
  test("it should create a connection over a local pair of streams", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {},
    });

    left.sink.write(Buffer.from("abc"));

    const right_data = await right.source[Symbol.asyncIterator]().next();
    expect(right_data.value.toString()).toEqual("abc");

    right.sink.write(Buffer.from("abc"));

    const left_data = await left.source[Symbol.asyncIterator]().next();
    expect(left_data.value.toString()).toEqual("abc");

    crpc.close(left);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(left.closed).toBe(true);
    expect(right.closed).toBe(true);

    expect(left.source.destroyed).toBe(true);
    expect(left.sink.destroyed).toBe(true);
  });
});
