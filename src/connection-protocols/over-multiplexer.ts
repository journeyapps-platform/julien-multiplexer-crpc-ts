import * as multiplexer from "../multiplexer";
import * as connection from "../connection";

export const createConnectionFromMultiplexer = (
  multiplexer: multiplexer.Multiplexer,
  params: connection.CreateConnectionParams
) => {
  return multiplexer.createConnection(params);
};
