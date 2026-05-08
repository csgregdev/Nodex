/**
 * Pixel-style terminal animation for indexing operations.
 * Single-line overwrite using \r — no curses required.
 *
 * Output looks like:
 *   [░▓░░] ████████░░░░░░░░ 127/247  home_screen.dart
 */

const SPINNER = ["▓░░░", "░▓░░", "░░▓░", "░░░▓", "░░▓░", "░▓░░"];
const BAR_WIDTH = 16;
const MAX_FILE_LEN = 42;

// ANSI
const C = {
  reset:  "\x1b[0m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  dim:    "\x1b[2m",
  bold:   "\x1b[1m",
  yellow: "\x1b[33m",
};

function bar(done: number, total: number): string {
  if (total === 0) return "░".repeat(BAR_WIDTH);
  const filled = Math.min(BAR_WIDTH, Math.round((done / total) * BAR_WIDTH));
  return C.green + "█".repeat(filled) + C.dim + "░".repeat(BAR_WIDTH - filled) + C.reset;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return "…" + s.slice(-(max - 1));
}

export interface Animation {
  update(file: string, done: number, total: number): void;
  tick(label: string): void;
  stop(summary: string): void;
}

export function startAnimation(phase: string): Animation {
  let frame = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentLine = "";

  function render(spinner: string, progressBar: string, counter: string, file: string) {
    const f = truncate(file, MAX_FILE_LEN).padEnd(MAX_FILE_LEN);
    currentLine = ` ${C.cyan}[${spinner}]${C.reset} ${progressBar} ${C.bold}${counter}${C.reset}  ${C.dim}${f}${C.reset}`;
    process.stdout.write("\r" + currentLine + "  ");
  }

  // Phase header
  process.stdout.write(`\n${C.cyan}${C.bold} nodex${C.reset} ${C.dim}${phase}${C.reset}\n`);

  let _done = 0;
  let _total = 0;
  let _file = "";

  interval = setInterval(() => {
    frame = (frame + 1) % SPINNER.length;
    const spinner = SPINNER[frame];
    const counter = _total > 0 ? `${_done}/${_total}` : "...";
    render(spinner, bar(_done, _total), counter, _file);
  }, 120);

  return {
    update(file: string, done: number, total: number) {
      _file = file;
      _done = done;
      _total = total;
      // Immediate render on update too
      const spinner = SPINNER[frame];
      const counter = `${done}/${total}`;
      render(spinner, bar(done, total), counter, file);
    },

    tick(label: string) {
      _file = label;
      const spinner = SPINNER[frame];
      render(spinner, bar(_done, _total), "...", label);
    },

    stop(summary: string) {
      if (interval) { clearInterval(interval); interval = null; }
      // Full bar + checkmark
      const fullBar = C.green + "█".repeat(BAR_WIDTH) + C.reset;
      process.stdout.write(
        `\r ${C.green}[████]${C.reset} ${fullBar} ${C.bold}${C.green}✓${C.reset}  ${summary}` +
        " ".repeat(MAX_FILE_LEN) + "\n\n"
      );
    },
  };
}
