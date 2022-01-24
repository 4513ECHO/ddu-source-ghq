import * as fn from "https://deno.land/x/denops_std@v2.4.0/function/mod.ts";
import type { ActionData } from "https://deno.land/x/ddu_kind_file@v0.1.0/file.ts";
import type { GatherArguments } from "https://deno.land/x/ddu_vim@v0.2.0/base/source.ts";
import type { Item } from "https://deno.land/x/ddu_vim@v0.2.0/types.ts";
import { BaseSource } from "https://deno.land/x/ddu_vim@v0.2.0/types.ts";
import { ensureString } from "https://deno.land/x/unknownutil@v1.1.4/mod.ts";
import { basename } from "https://deno.land/std@0.122.0/path/mod.ts";

interface Params {
  bin: string;
  display: "raw" | "basename" | "shorten";
}

export class Source extends BaseSource<Params, ActionData> {
  kind = "file";

  gather(args: GatherArguments<Params>): ReadableStream<Item<ActionData>[]> {
    const displayWord = async (item: string): Promise<string> => {
      if (args.sourceParams.display == "raw") {
        return item;
      } else if (args.sourceParams.display === "basename") {
        return basename(item);
      } else if (args.sourceParams.display === "shorten") {
        const result = await fn.pathshorten(args.denops, item);
        ensureString(result);
        return result;
      } else {
        await args.denops.call(
          "ddu#util#print_error",
          `Invalid display param: ${args.sourceParams.display}`,
        );
        return;
      }
    };

    return new ReadableStream({
      async start(controller) {
        const proc = Deno.run({
          cmd: [args.sourceParams.bin, "list", "--full-path"],
          stdin: "piped",
          stdout: "piped",
        });
        if (!(await proc.status()).success) {
          args.denops.call(
            "ddu#util#print_error",
            `Invalid bin param: ${args.sourceParams.bin}`,
          );
          proc.close();
          return;
        }
        const paths = new TextDecoder().decode(await proc.output()).split("\n");
        proc.close();
        controller.enqueue(
          await Promise.all(paths.map(async (i) => {
            const display = await displayWord(i);
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
    };
  }
}
