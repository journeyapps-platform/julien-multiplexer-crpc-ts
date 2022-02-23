import * as crpc from "../src/node";
import "jest";

describe("bson-framing", () => {
  it("should correctly frame data with bson", async () => {
    const [left, right] = crpc.createLocalConnectionPair({
      metadata: {}
    });

    const left_framed = crpc.bson.createBSONFramedConnection(left);
    const right_framed = crpc.bson.createBSONFramedConnection(right);

    await left_framed.sink.getWriter().write({
      a: "b"
    });

    await right_framed.sink.getWriter().write({
      c: "d"
    });

    expect(right_framed.source.getReader().read()).resolves.toEqual({
      done: false,
      value: {
        a: "b"
      }
    });

    expect(left_framed.source.getReader().read()).resolves.toEqual({
      done: false,
      value: {
        c: "d"
      }
    });
  });
});
