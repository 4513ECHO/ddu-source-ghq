import type { Denops } from "https://deno.land/x/denops_std@v4.0.0/mod.ts";
import type { ActionData } from "https://deno.land/x/ddu_kind_file@v0.3.2/file.ts";
import type {
  GatherArguments,
  OnInitArguments,
} from "https://deno.land/x/ddu_vim@v2.3.0/base/source.ts";
import type {
  Actions,
  Item,
} from "https://deno.land/x/ddu_vim@v2.3.0/types.ts";
import {
  ActionFlags,
  BaseSource,
} from "https://deno.land/x/ddu_vim@v2.3.0/types.ts";
import { pathshorten } from "https://deno.land/x/denops_std@v4.0.0/function/mod.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v2.1.0/mod.ts";
import { basename, relative } from "https://deno.land/std@0.177.0/path/mod.ts";
import { TextLineStream } from "https://deno.land/std@0.177.0/streams/text_line_stream.ts";
import { input } from "https://deno.land/x/denops_std@v4.0.0/helper/mod.ts";

type Params = {
  bin: string;
  display: "raw" | "basename" | "shorten" | "relative";
  rootPath: string;
};

class EchomsgStream extends WritableStream<string> {
  constructor(denops: Denops) {
    super({
      write: async (chunk, _controller) => {
        await denops.cmd("echomsg '[ddu-source-ghq]' chunk", { chunk });
      },
    });
  }
}

export class Source extends BaseSource<Params, ActionData> {
  override kind = "file";
  #rootPath = "";
  #buffer: Item<ActionData>[] = [];

  override async onInit(args: OnInitArguments<Params>): Promise<void> {
    if (!args.sourceParams.rootPath) {
      for await (const output of this.#runProcess(args, ["root"])) {
        this.#rootPath = output.replace(/\r?\n/g, "");
      }
    } else {
      this.#rootPath = args.sourceParams.rootPath;
    }
  }

  override gather(
    args: GatherArguments<Params>,
  ): ReadableStream<Item<ActionData>[]> {
    return this.#runProcess(args, ["list", "--full-path"])
      .pipeThrough(
        new TransformStream<string, Item<ActionData>[]>({
          transform: async (chunk, controller) => {
            if (!chunk.length) {
              return;
            }
            this.#buffer.push({
              word: chunk,
              display: await this.#displayWord(args, chunk),
              action: {
                path: chunk,
                isDirectory: true,
              },
              treePath: chunk,
              isTree: true,
            });
            if (this.#buffer.length > 1000) {
              controller.enqueue(this.#buffer);
              this.#buffer = [];
            }
          },
          flush: (controller) => {
            controller.enqueue(this.#buffer);
            this.#buffer = [];
          },
        }),
      );
  }

  override actions: Actions<Params> = {
    create: async (args) => {
      const result = await input(args.denops, { prompt: "ghq create: " });
      if (!result) {
        return Promise.resolve(ActionFlags.Persist);
      }
      this.#runProcess(args, ["create", result]);
      return Promise.resolve(ActionFlags.RefreshItems);
    },
    get: async (args) => {
      const result = await input(args.denops, { prompt: "ghq get: " });
      if (!result) {
        return Promise.resolve(ActionFlags.Persist);
      }
      this.#runProcess(args, ["get", result]);
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
    item: string,
  ): Promise<string> {
    switch (args.sourceParams.display) {
      case "raw":
        return item;
      case "basename":
        return basename(item);
      case "shorten":
        return ensureString(await pathshorten(args.denops, item));
      case "relative":
        return relative(this.#rootPath, item);
      default:
        await args.denops.call(
          "ddu#util#print_error",
          `Invalid display param: ${args.sourceParams.display}`,
          "ddu-source-ghq",
        );
        return item;
    }
  }

  #runProcess(
    args: { denops: Denops; sourceParams: Params },
    subcmds: string[],
  ): ReadableStream<string> {
    const { stderr, stdout, status } = new Deno.Command(args.sourceParams.bin, {
      args: subcmds,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    }).spawn();
    status.then((status) => {
      if (!status.success) {
        stderr
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream())
          .pipeTo(new EchomsgStream(args.denops));
      }
    });
    return stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());
  }
}
