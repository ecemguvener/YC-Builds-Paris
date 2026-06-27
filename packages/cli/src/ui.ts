import pc from "picocolors";

type Writable = Pick<NodeJS.WriteStream, "write">;
type ProgressWritable = Writable & {
  isTTY?: boolean;
  columns?: number;
  clearLine?: (dir: number) => boolean;
  cursorTo?: (x: number) => boolean;
};

export interface ProgressBar {
  advance(message?: string): void;
  complete(message?: string): void;
}

export interface LoadingBar {
  complete(message?: string): void;
  fail(message?: string): void;
}

export interface CliUi {
  title(title: string): void;
  step(message: string): void;
  success(message: string): void;
  muted(message: string): void;
  error(message: string): void;
  table(rows: Array<[label: string, value: string | null | undefined]>): void;
  next(commands: string[]): void;
  progress(label: string, total: number): ProgressBar;
  loading(label: string): LoadingBar;
}

export function createCliUi(stdout: ProgressWritable, stderr: Writable): CliUi {
  return {
    title() {
      return;
    },
    step(message) {
      stdout.write(`${pc.cyan("●")} ${message}\n`);
    },
    success(message) {
      stdout.write(`${pc.green("✓")} ${message}\n`);
    },
    muted(message) {
      stdout.write(`${pc.dim(message)}\n`);
    },
    error(message) {
      stderr.write(`${pc.red("✕")} ${message}\n`);
    },
    table(rows) {
      const visibleRows = rows.filter(([, value]) => typeof value === "string" && value.length > 0) as Array<[string, string]>;
      if (visibleRows.length === 0) {
        return;
      }

      const labelWidth = Math.max(...visibleRows.map(([label]) => label.length));
      stdout.write("\n");
      for (const [label, value] of visibleRows) {
        stdout.write(`${pc.dim(label.padEnd(labelWidth))}  ${value}\n`);
      }
    },
    next(commands) {
      if (commands.length === 0) {
        return;
      }

      stdout.write(`\n${pc.bold("Next:")}\n`);
      for (const command of commands) {
        stdout.write(`  ${pc.cyan(command)}\n`);
      }
    },
    progress(label, total) {
      let current = 0;
      const canRenderInline = Boolean(stdout.isTTY && stdout.clearLine && stdout.cursorTo);

      function render(message?: string) {
        const safeTotal = Math.max(total, 1);
        const width = Math.min(28, Math.max(12, (stdout.columns ?? 80) - label.length - 28));
        const ratio = Math.min(current / safeTotal, 1);
        const filled = Math.round(width * ratio);
        const bar = `${pc.cyan("█".repeat(filled))}${pc.dim("░".repeat(width - filled))}`;
        const suffix = message ? ` ${pc.dim(message)}` : "";
        const line = `${pc.cyan("●")} ${label} ${bar} ${current}/${total}${suffix}`;

        if (canRenderInline) {
          stdout.clearLine?.(0);
          stdout.cursorTo?.(0);
          stdout.write(line);
        }
      }

      if (!canRenderInline) {
        stdout.write(`${pc.cyan("●")} ${label}\n`);
      } else {
        render();
      }

      return {
        advance(message) {
          current = Math.min(current + 1, total);
          render(message);
        },
        complete(message) {
          current = total;
          if (canRenderInline) {
            render(message);
            stdout.write("\n");
          }
          stdout.write(`${pc.green("✓")} ${message || label}\n`);
        }
      };
    },
    loading(label) {
      const canRenderInline = Boolean(stdout.isTTY && stdout.clearLine && stdout.cursorTo);
      const frames = ["░░░", "█░░", "██░", "███", "░██", "░░█"];
      let frameIndex = 0;
      let interval: NodeJS.Timeout | null = null;

      function render() {
        const frame = pc.cyan(frames[frameIndex % frames.length]);
        frameIndex += 1;
        const line = `${pc.cyan("●")} ${label} ${frame}`;

        if (canRenderInline) {
          stdout.clearLine?.(0);
          stdout.cursorTo?.(0);
          stdout.write(line);
        }
      }

      function stop() {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }

      if (!canRenderInline) {
        stdout.write(`${pc.cyan("●")} ${label}\n`);
      } else {
        render();
        interval = setInterval(render, 120);
      }

      return {
        complete(message) {
          stop();
          if (canRenderInline) {
            stdout.clearLine?.(0);
            stdout.cursorTo?.(0);
          }
          stdout.write(`${pc.green("✓")} ${message || label}\n`);
        },
        fail(message) {
          stop();
          if (canRenderInline) {
            stdout.clearLine?.(0);
            stdout.cursorTo?.(0);
          }
          stdout.write(`${pc.red("✕")} ${message || label}\n`);
        }
      };
    }
  };
}
