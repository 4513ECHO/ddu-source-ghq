import * as fn from "https://deno.land/x/denops_std@v3.3.2/function/mod.ts";
import type { ActionData } from "https://deno.land/x/ddu_kind_file@v0.3.0/file.ts";
import type {
  GatherArguments,
  OnInitArguments,
} from "https://deno.land/x/ddu_vim@v1.8.7/base/source.ts";
import type {
  Actions,
  Item,
} from "https://deno.land/x/ddu_vim@v1.8.7/types.ts";
import {
  ActionFlags,
  BaseSource,
} from "https://deno.land/x/ddu_vim@v1.8.7/types.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v2.0.0/mod.ts";
import { basename, relative } from "https://deno.land/std@0.148.0/path/mod.ts";
import { input } from "https://deno.land/x/denops_std@v3.3.2/helper/mod.ts";

interface Params {
  bin: string;
  display: "raw" | "basename" | "shorten" | "relative";
  rootPath: string;
}

async function runProcess(
  args: { denops: Denops; sourceParams: Params },
  subcmds: string[],
): Promise<string> {
  const proc = Deno.run({
    cmd: [args.sourceParams.bin, ...subcmds],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });
  if (!(await proc.status()).success) {
    args.denops.call(
      "ddu#util#print_error",
      `Invalid bin param: ${args.sourceParams.bin}`,
      new TextDecoder().decode(await proc.stderrOutput()),
    );
    proc.close();
    return;
  }
  return new TextDecoder().decode(await proc.output());
}

export class Source extends BaseSource<Params, ActionData> {
  private rootPath = "";
  kind = "file";

  async onInit(args: OnInitArguments<Params>): Promise<void> {
    if (!args.sourceParams.rootPath) {
      const output = await runProcess(args, ["root"]);
      this.rootPath = output.replace(/\r?\n/g, "");
    } else {
      this.rootPath = args.sourceParams.rootPath;
    }
  }

  gather(args: GatherArguments<Params>): ReadableStream<Item<ActionData>[]> {
    const { rootPath, displayWord } = this;
    return new ReadableStream({
      async start(controller) {
        const output = await runProcess(args, ["list", "--full-path"]);
        const paths = output.split(/\r?\n/g);
        controller.enqueue(
          await Promise.all(paths.map(async (i) => {
            const display = await displayWord(args, i, rootPath);
            return {
              word: i,
              display: display,
              action: {
                path: i,
                isDirectory: true,
              },
            };
          })),
        );
        controller.close();
      },
    });
  }

  actions: Actions<Params> = {
    async create(args) {
      const result = await input(args.denops, { prompt: "create: " });
      if (!result) {
        return Promise.resolve(ActionFlags.None);
      }
      await runProcess({
        denops: args.denops,
        sourceParams: args.sourceParams,
      }, ["create", result]);
      return Promise.resolve(ActionFlags.RefreshItems);
    },
  };

  params(): Params {
    return {
      bin: "ghq",
      display: "raw",
      rootPath: "",
    };
  }

  private async displayWord(
    args: GatherArguments<Params>,
    item: string,
    rootPath: string,
  ): Promise<string> {
    switch (args.sourceParams.display) {
      case "raw":
        return item;
      case "basename":
        return basename(item);
      case "shorten":
        return ensureString(await fn.pathshorten(args.denops, item));
      case "relative":
        return relative(rootPath, item);
      default:
        await args.denops.call(
          "ddu#util#print_error",
          `Invalid display param: ${args.sourceParams.display}`,
        );
        return item;
    }
  }
}
