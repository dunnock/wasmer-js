// The Wasm Terminal

import { Terminal, ITerminalOptions, IBufferLine } from "xterm";

// tslint:disable-next-line
import * as fit from "xterm/lib/addons/fit/fit";
// tslint:disable-next-line
Terminal.applyAddon(fit);

import { WebLinksAddon } from "xterm-addon-web-links";

import WasmTerminalConfig from "./wasm-terminal-config";
import WasmTty from "./wasm-tty/wasm-tty";
import WasmShell from "./wasm-shell/wasm-shell";

// Fixes for mobile firefox odd textarea behavior
const MOBILE_KEYBOARD_EVENTS = ["click", "tap"];
const INITIAL_TEXTAREA_VALUE = "A";

export default class WasmTerminal {
  xterm: Terminal;
  container: HTMLElement | undefined;
  webLinksAddon: WebLinksAddon;

  wasmTerminalConfig: WasmTerminalConfig;
  wasmTty: WasmTty;
  wasmShell: WasmShell;

  pasteEvent: any;
  resizeEvent: any;
  dataEvent: any;

  isOpen: boolean;
  pendingPrintOnOpen: string;

  constructor(config: any) {
    // Create our xterm element
    this.xterm = new Terminal();
    // tslint:disable-next-line
    this.pasteEvent = this.xterm.on("paste", this.onPaste);
    // tslint:disable-next-line
    this.resizeEvent = this.xterm.on("resize", this.handleTermResize);
    this.xterm.onKey((keyEvent: { key: string; domEvent: KeyboardEvent }) => {
      // Fix for mobile firefox "composition mode"
      const event = keyEvent.domEvent as any;
      event.preventDefault();
      event.stopPropagation();
      event.target.value = INITIAL_TEXTAREA_VALUE;
      return false;
    });

    // Set up our container
    this.container = undefined;

    // Load our addons
    this.webLinksAddon = new WebLinksAddon();
    this.xterm.loadAddon(this.webLinksAddon);

    this.wasmTerminalConfig = new WasmTerminalConfig(config);

    // Create our Shell and tty
    this.wasmTty = new WasmTty(this.xterm);
    this.wasmShell = new WasmShell(this.wasmTerminalConfig, this.wasmTty);
    // tslint:disable-next-line
    this.dataEvent = this.xterm.on("data", this.wasmShell.handleTermData);

    this.isOpen = false;
    this.pendingPrintOnOpen = "";
  }

  open(container: HTMLElement) {
    // Remove any current event listeners
    const focusHandler = this.focus.bind(this);
    if (this.container !== undefined) {
      MOBILE_KEYBOARD_EVENTS.forEach(eventName => {
        // @ts-ignore
        this.container.removeEventListener(eventName, focusHandler);
      });
    }

    this.container = container;

    this.xterm.open(container);
    this.isOpen = true;
    setTimeout(() => {
      // Fix for Mobile Browsers and their virtual keyboards
      if (this.container !== undefined) {
        MOBILE_KEYBOARD_EVENTS.forEach(eventName => {
          // @ts-ignore
          this.container.addEventListener(eventName, focusHandler);
        });
      }

      // Fix for FireFox not respecting textareas correctly
      const textArea = container.querySelector(".xterm-helper-textarea");
      if (textArea) {
        (textArea as any).value = INITIAL_TEXTAREA_VALUE;

        // Stop composition events
        const onCompositionEvent = (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          this.wasmShell.handleData(event.data);
          return false;
        };

        textArea.addEventListener("compositionstart", onCompositionEvent, true);
        textArea.addEventListener(
          "compositionupdate",
          onCompositionEvent,
          true
        );
        textArea.addEventListener("compositionend", onCompositionEvent, true);
      }

      if (this.pendingPrintOnOpen) {
        this.wasmTty.print(this.pendingPrintOnOpen + "\n");
        this.pendingPrintOnOpen = "";
      }

      // tslint:disable-next-line
      this.wasmShell.prompt();
    });
  }

  fit() {
    (this.xterm as any).fit();
  }

  focus() {
    this.xterm.blur();
    this.xterm.focus();
    this.xterm.scrollToBottom();
  }

  print(message: string) {
    // For some reason, double new lines are not respected. Thus, fixing that here
    message = message.replace(/\n\n/g, "\n \n");

    if (!this.isOpen) {
      if (this.pendingPrintOnOpen) {
        this.pendingPrintOnOpen += message;
      } else {
        this.pendingPrintOnOpen = message;
      }
      return;
    }

    if (this.wasmShell.isPrompting) {
      // Cancel the current prompt and restart
      this.wasmShell.printAndRestartPrompt(() => {
        this.wasmTty.print(message + "\n");
        return undefined;
      });
      return;
    }

    this.wasmTty.print(message);
  }

  runCommand(line: string) {
    if (this.wasmShell.isPrompting()) {
      this.wasmTty.setInput(line);
      this.wasmShell.handleReadComplete();
    }
  }

  destroy() {
    // tslint:disable-next-line
    this.xterm.off("paste", this.onPaste);
    // tslint:disable-next-line
    this.xterm.off("resize", this.handleTermResize);
    // tslint:disable-next-line
    this.xterm.off("data", this.wasmShell.handleTermData);
    this.xterm.destroy();
    delete this.xterm;
  }

  onPaste(data: string) {
    this.wasmTty.print(data);
  }

  /**
   * Handle terminal resize
   *
   * This function clears the prompt using the previous configuration,
   * updates the cached terminal size information and then re-renders the
   * input. This leads (most of the times) into a better formatted input.
   */
  handleTermResize = (data: { rows: number; cols: number }) => {
    const { rows, cols } = data;
    this.wasmTty.clearInput();
    this.wasmTty.setTermSize(cols, rows);
    this.wasmTty.setInput(this.wasmTty.getInput(), true);
  };
}
