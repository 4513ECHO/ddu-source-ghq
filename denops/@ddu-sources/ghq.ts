import * as fn from "https://deno.land/x/denops_std@v3.1.4/function/mod.ts";
import type { ActionData } from "https://deno.land/x/ddu_kind_file@v0.2.0/file.ts";
import type {
  GatherArguments,
  OnInitArguments,
} from "https://deno.land/x/ddu_vim@v1.1.0/base/source.ts";
import type { Item } from "https://deno.land/x/ddu_vim@v1.1.0/types.ts";
import { BaseSource } from "https://deno.land/x/ddu_vim@v1.1.0/types.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v2.0.0/mod.ts";
import { basename, relative } from "https://deno.land/std@0.127.0/path/mod.ts";

interface Params {
  bin: string;
  display: "raw" | "basename" | "shorten" | "relative";
  rootPath: string;
}

export class Source extends BaseSource<Params, ActionData> {
  private rootPath = "";
  kind = "file";

  async onInit(args: OnInitArguments<Params>): Promise<void> {
    if (!args.sourceParams.rootPath) {
      const output = await this.runProcess(args, ["root"]);
      this.rootPath = output.replace(/\r?\n/g, "");
    } else {
      this.rootPath = args.sourceParams.rootPath;
    }
  }

  gather(args: GatherArguments<Params>): ReadableStream<Item<ActionData>[]> {
    const { rootPath, runProcess, displayWord } = this;
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
              },
            } as Item<ActionData>;
          })),
        );
        controller.close();
      },
    });
  }

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

  private async runProcess(
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
}
