import * as connection from "../connection";
import * as stream from "stream";
import * as bson from "bson";

/**
 * Read a given `size` number of bytes from a give array of `chunks` as a Buffer. The returned Buffer could be
 * larger than the requested size. If the chunks array contains less than the requested size then null is
 * returned
 */
export const readBufferFromChunks = (chunks: Buffer[], size: number) => {
  let batch = [];
  let current_size = 0;
  for (const chunk of chunks) {
    batch.push(chunk);
    current_size += chunk.length;
    if (current_size >= size) {
      return {
        buffer: Buffer.concat(batch),
        chunks_read: batch.length,
      };
    }
  }
  return null;
};

/**
 * Read exactly `size` bytes from a given array of `chunks`, modifying the passed array to remove what
 * was read.
 *
 * If more than `size` is read from the chunks array then the remainder is unshifted back onto the array
 */
export const readBufferFromChunksAndModify = (
  chunks: Buffer[],
  size: number
): Buffer | null => {
  const res = readBufferFromChunks(chunks, size);
  if (!res) {
    return null;
  }

  if (res.buffer.length > size) {
    chunks.splice(0, res.chunks_read, res.buffer.slice(size));
    return res.buffer.slice(0, size);
  }
  chunks.splice(0, res.chunks_read);
  return res.buffer;
};

/**
 * Creates a abstraction on top of a compressed set of Buffer chunks that keeps track of the
 * entire byte size of the chunks array.
 *
 * Offers methods to get the byte size, peak at a given amount of data and destructively read
 * a given amount of data
 */
export const createReadableBufferArray = () => {
  let chunks: Buffer[] = [];
  let current_size = 0;
  return {
    push(...new_chunks: Buffer[]) {
      chunks.push(...new_chunks);
      current_size = new_chunks.reduce((size, chunk) => {
        return size + chunk.length;
      }, current_size);
    },
    read(size: number) {
      const buffer = readBufferFromChunksAndModify(chunks, size);
      if (buffer) {
        current_size -= size;
      }

      return buffer;
    },
    peak(size: number) {
      if (current_size < size) {
        return null;
      }

      const res = readBufferFromChunks(chunks, 4);
      if (!res) {
        return null;
      }

      return res.buffer;
    },
    size() {
      return current_size;
    },
  };
};

export type BSONStreamDecoderParams = {
  deserialize_options?: bson.DeserializeOptions;
  highWaterMark?: number;
};
export const createBSONStreamDecoder = (params?: BSONStreamDecoderParams) => {
  const buffer = createReadableBufferArray();
  let frame_size: null | number = null;

  const decodeFrame = () => {
    if (frame_size === null) {
      frame_size = buffer.peak(4)?.readInt32LE(0) || null;
    }
    if (frame_size === null) {
      return false;
    }

    if (buffer.size() < frame_size) {
      return false;
    }

    const frame = buffer.read(frame_size);
    if (!frame) {
      return false;
    }

    frame_size = null;
    return bson.deserialize(frame, {
      promoteBuffers: true,
      ...(params?.deserialize_options || {}),
    });
  };

  function* decodeFrames() {
    let frame: false | bson.Document;
    while ((frame = decodeFrame())) {
      yield frame;
    }
  }

  const transform = new stream.Transform({
    readableObjectMode: true,
    readableHighWaterMark: params?.highWaterMark ?? 1,

    transform(chunk: Buffer, _, done) {
      buffer.push(chunk);
      for (const frame of decodeFrames()) {
        transform.push(frame);
      }
      done();
    },

    flush(done) {
      for (const frame of decodeFrames()) {
        transform.push(frame);
      }
      done();
    },

    final(done) {
      for (const frame of decodeFrames()) {
        transform.push(frame);
      }
      done();
    },
  });

  return transform;
};

export const createBsonFramedConnection = (conn: connection.Connection) => {
  const source = stream.pipeline(
    conn.source,
    createBSONStreamDecoder(),
    () => {}
  );

  const sink = new stream.Transform({
    writableObjectMode: true,
    writableHighWaterMark: 1,
    transform(chunk, _, done) {
      done(null, bson.serialize(chunk));
    },
  });

  stream.pipeline(sink, conn.sink, () => {});

  return {
    ...conn,
    source,
    sink,
  };
};
