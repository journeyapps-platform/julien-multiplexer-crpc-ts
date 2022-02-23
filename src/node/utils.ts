import * as stream from "stream/web"

export const readableFrom = <T = any>(
  iterable: Iterable<T> | AsyncIterable<T>,
  strategy?: stream.QueuingStrategy<T>
): stream.ReadableStream<T> => {
  if (iterable instanceof stream.ReadableStream) {
    return iterable;
  }

  let resume: (() => void) | undefined;
  return new stream.ReadableStream<T>(
    {
      start(controller) {
        void (async function () {
          for await (const chunk of iterable) {
            controller.enqueue(chunk);

            if (controller.desiredSize != null && controller.desiredSize <= 0) {
              await new Promise<void>((resolve) => {
                resume = resolve;
              });
            }
          }

          controller.close();
        })().catch((err) => {
          controller.error(err);
        });
      },
      async pull() {
        resume?.();
      }
    },
    strategy
  );
};
