import * as stream from "stream/web";
import * as uuid from "uuid";

export type ConnectionMetadata = Record<string, any>;

export enum CloseStatusCode {
  Error = "error",
  Success = "success"
}

export type CloseStatus = {
  code: CloseStatusCode;
  reason?: string;
};

export type Connection<I = Buffer, O = Buffer> = {
  id: string;
  metadata: ConnectionMetadata;

  source: stream.ReadableStream<O>;
  sink: stream.WritableStream<I>;

  closed: boolean;
  status: Promise<CloseStatus>;

  source_closed: boolean;
  source_status: Promise<CloseStatus>;

  sink_closed: boolean;
  sink_status: Promise<CloseStatus>;

  abort: () => Promise<void>;
};

export type CreateConnectionParams = {
  id?: string;
  metadata?: Partial<ConnectionMetadata>;
};

const asCloseStatus = (operation: Promise<any>): Promise<CloseStatus> => {
  return operation
    .then(() => {
      return {
        code: CloseStatusCode.Success
      };
    })
    .catch((err) => {
      let reason;
      if (err) {
        if (err instanceof Error) {
          reason = err.message;
        } else {
          reason = err.toString();
        }
      }

      return {
        code: CloseStatusCode.Error,
        reason
      };
    });
};

const createDeferredPromise = <T = void>() => {
  let resolve: (arg: T) => void, reject: (err?: Error | any) => void;
  let settled = false;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = (arg) => {
      settled = true;
      _resolve(arg);
    };
    reject = (err) => {
      settled = true;
      _reject(err);
    };
  });
  return {
    promise,
    get settled() {
      return settled;
    },
    resolve: resolve!,
    reject: reject!
  };
};

export type CreateConnectionFromStream<
  I = Buffer,
  O = Buffer
> = CreateConnectionParams & {
  source: stream.ReadableStream<O>;
  sink: stream.WritableStream<I>;
};
export const create = <I, O>(
  params: CreateConnectionFromStream<I, O>
): Connection<I, O> => {
  const controller = new AbortController();

  const source = new stream.TransformStream();
  const sink = new stream.TransformStream();

  const source_status = createDeferredPromise<CloseStatus>();
  const sink_status = createDeferredPromise<CloseStatus>();

  asCloseStatus(
    params.source.pipeTo(source.writable, {
      signal: controller.signal
    })
  ).then((status) => {
    source_status.resolve(status);
    if (status.code === CloseStatusCode.Error) {
      controller.abort();
    }
  });

  asCloseStatus(
    sink.readable.pipeTo(params.sink, {
      signal: controller.signal
    })
  ).then((status) => {
    sink_status.resolve(status);
    if (status.code === CloseStatusCode.Error) {
      controller.abort();
    }
  });

  let closed = false;

  const connection_status = Promise.all([
    source_status.promise,
    sink_status.promise
  ]).then((statuses) => {
    closed = true;

    const failed_status = statuses.find(
      (status) => status.code === CloseStatusCode.Error
    );
    if (failed_status) {
      return failed_status;
    }
    return {
      code: CloseStatusCode.Success
    };
  });

  return {
    id: params.id || uuid.v4(),
    metadata: params.metadata || {},

    source: source.readable,
    sink: sink.writable,

    abort: async () => {
      controller.abort();
      await connection_status;
    },

    status: connection_status,
    get closed() {
      return closed;
    },

    source_status: source_status.promise,
    get source_closed() {
      return source_status.settled;
    },
    sink_status: sink_status.promise,
    get sink_closed() {
      return sink_status.settled;
    }
  };
};
