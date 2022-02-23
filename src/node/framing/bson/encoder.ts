import * as constants from './constants';
import * as stream from 'stream/web';
import * as bson from 'bson';

export type BSONStreamEncoderParams<T> = {
  serialize_options?: bson.SerializeOptions;
  sendTerminatorOnEnd?: boolean;
  writableStrategy?: stream.QueuingStrategy<T >;
  readableStrategy?: stream.QueuingStrategy<Buffer >;
};

export const createBSONStreamEncoder = <T = any>(params?: BSONStreamEncoderParams<T>) => {
  let readableStrategy = params?.readableStrategy;
  if (!readableStrategy) {
    readableStrategy = new stream.ByteLengthQueuingStrategy({
      highWaterMark: 1024 * 16
    });
  }

  return new stream.TransformStream<T, Buffer>(
    {
      transform(chunk, controller) {
        controller.enqueue(bson.serialize(chunk, params?.serialize_options));
      },
      flush(controller) {
        if (params?.sendTerminatorOnEnd ?? true) {
          controller.enqueue(constants.TERMINATOR);
        }
      }
    },
    params?.writableStrategy,
    readableStrategy
  );
};
