import type { Denops } from "https://deno.land/x/denops_std@v5.1.0/mod.ts";
import type { ActionData } from "https://deno.land/x/ddu_kind_file@v0.7.1/file.ts";
import type {
  GatherArguments,
  OnInitArguments,
} from "https://deno.land/x/ddu_vim@v3.7.0/base/source.ts";
import type {
  Actions,
  Item,
} from "https://deno.land/x/ddu_vim@v3.7.0/types.ts";
import {
  ActionFlags,
  BaseSource,
} from "https://deno.land/x/ddu_vim@v3.7.0/types.ts";
import { pathshorten } from "https://deno.land/x/denops_std@v5.1.0/function/mod.ts";
import { basename, relative } from "https://deno.land/std@0.208.0/path/mod.ts";
import { TextLineStream } from "https://deno.land/std@0.208.0/streams/text_line_stream.ts";
import { ChunkedStream } from "https://deno.land/x/chunked_stream@0.1.2/mod.ts";
import { input } from "https://deno.land/x/denops_std@v5.1.0/helper/mod.ts";

export type Params = {
  bin: string;
  display: "raw" | "basename" | "shorten" | "relative";
  rootPath: string;
};

export class Source extends BaseSource<Params, ActionData> {
  override kind = "file";
  #bin = "";
  #rootPath = "";

  override async onInit(args: OnInitArguments<Params>): Promise<void> {
    this.#bin = args.sourceParams.bin;
    if (!args.sourceParams.rootPath) {
      this.#rootPath = (await Array.fromAsync(this.#runProcess(["root"])))[0];
    } else {
      this.#rootPath = args.sourceParams.rootPath;
    }
  }

  override gather(
    args: GatherArguments<Params>,
  ): ReadableStream<Item<ActionData>[]> {
    return this.#runProcess(["list", "--full-path"])
      .pipeThrough(
        new TransformStream<string, Item<ActionData>>({
          transform: async (chunk, controller) => {
            if (!chunk.length) {
              return;
            }
            controller.enqueue({
              word: chunk,
              display: await this.#displayWord(args, chunk),
              action: {
                path: chunk,
                isDirectory: true,
              },
            });
          },
        }),
      )
      .pipeThrough(new ChunkedStream({ chunkSize: 1000 }));
  }

  override actions: Actions<Params> = {
    create: async (args) => {
      const result = await input(args.denops, { prompt: "ghq create: " });
      if (!result) {
        return Promise.resolve(ActionFlags.Persist);
      }
      // NOTE: Wait until the process is finished.
      await Array.fromAsync(this.#runProcess(["create", result]));
      return Promise.resolve(ActionFlags.RefreshItems);
    },
    get: async (args) => {
      const result = await input(args.denops, { prompt: "ghq get: " });
      if (!result) {
        return Promise.resolve(ActionFlags.Persist);
      }
      // NOTE: Wait until the process is finished.
      await Array.fromAsync(this.#runProcess(["get", result]));
      return Promise.resolve(ActionFlags.RefreshItems);
    },
  };

  override params(): Params {
    return {
      bin: "ghq",
      display: "raw",
      rootPath: "",
    };
  }

  async #displayWord(
    args: { denops: Denops; sourceParams: Params },
    word: string,
  ): Promise<string> {
    switch (args.sourceParams.display) {
      case "raw":
        return word;
      case "basename":
        return basename(word);
      case "shorten":
        return await pathshorten(args.denops, word);
      case "relative":
        return relative(this.#rootPath, word);
      default:
        await args.denops.call(
          "ddu#util#print_error",
          `Invalid display param: ${args.sourceParams.display}`,
          "ddu-source-ghq",
        );
        return word;
    }
  }

  #runProcess(args: string[]): ReadableStream<string> {
    const { status, stderr, stdout } = new Deno.Command(this.#bin, {
      args,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    }).spawn();
    status.then(async ({ success }) => {
      if (success) {
        return;
      }
      const lines = await Array.fromAsync(
        stderr
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream()),
      );
      throw new Error(lines.join("\n"));
    });
    return stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());
  }
}
