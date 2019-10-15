import WASI from "@wasmer/wasi";

import {
  WasmCommandOptions,
  CallbackCommandOptions
} from "../command-runner/command";

import WASICommand from "./wasi-command";

export default class Process {
  commandOptions: WasmCommandOptions | CallbackCommandOptions;
  dataCallback: Function;
  endCallback: Function;
  errorCallback: Function;
  sharedStdin?: Int32Array;
  startStdinReadCallback?: Function;

  wasiCommand?: WASICommand;
  callbackCommand?: any;

  constructor(
    commandOptions: WasmCommandOptions | CallbackCommandOptions,
    dataCallback: Function,
    endCallback: Function,
    errorCallback: Function,
    sharedStdinBuffer?: SharedArrayBuffer,
    startStdinReadCallback?: Function
  ) {
    this.commandOptions = commandOptions;
    this.dataCallback = dataCallback;
    this.endCallback = endCallback;
    this.errorCallback = errorCallback;

    let sharedStdin: Int32Array | undefined = undefined;
    if (sharedStdinBuffer) {
      sharedStdin = new Int32Array(sharedStdinBuffer);
    }

    if ((commandOptions as WasmCommandOptions).module) {
      this.wasiCommand = new WASICommand(
        commandOptions as WasmCommandOptions,
        sharedStdin,
        startStdinReadCallback
      );
    } else {
      this.callbackCommand = (commandOptions as CallbackCommandOptions).callback;
    }
  }

  async start(pipedStdinData?: Uint8Array) {
    if (this.wasiCommand) {
      await this.startWASICommand(pipedStdinData);
    } else if (this.callbackCommand) {
      await this.startCallbackCommand(pipedStdinData);
    }
  }

  async startWASICommand(pipedStdinData?: Uint8Array) {
    if (!this.wasiCommand) {
      throw new Error("There is no wasi command on this process");
    }

    const commandStream = await this.wasiCommand.instantiate(
      this.dataCallback,
      pipedStdinData
    );

    commandStream.on("end", () => {
      this.endCallback();
    });

    try {
      this.wasiCommand.run();
    } catch (e) {
      if (e.code === 0) {
        // Command was successful, but ended early.
        this.endCallback();
        return;
      }
      let error = "Unknown Error";

      if (e.code !== undefined) {
        error = `exited with code: ${e.code}`;
      } else if (e.signal !== undefined) {
        error = `killed with signal: ${e.signal}`;
      } else if (e.user !== undefined) {
        error = e.message;
      }

      this.errorCallback(error);
    }
  }

  async startCallbackCommand(pipedStdinData?: Uint8Array) {
    if (!this.callbackCommand) {
      throw new Error("There is no callback command on this process");
    }

    let stdin = "";
    if (pipedStdinData) {
      stdin = new TextDecoder("utf-8").decode(pipedStdinData);
    }

    try {
      const stdout = await this.callbackCommand(
        this.commandOptions.args,
        stdin
      );
      const stdoutAsTypedArray = new TextEncoder().encode(stdout + "\n");
      this.dataCallback(stdoutAsTypedArray);
      this.endCallback();
    } catch (e) {
      this.errorCallback("There was an error running the callback command");
    }
  }
}
