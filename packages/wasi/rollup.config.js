// Rollup config for the WASI Lib

import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import builtins from "rollup-plugin-node-builtins";
import globals from "rollup-plugin-node-globals";
// import typescript from "rollup-plugin-typescript2";
import babel from "rollup-plugin-babel";
import json from "rollup-plugin-json";
import replace from "rollup-plugin-replace";
import compiler from "@ampproject/rollup-plugin-closure-compiler";
import bundleSize from "rollup-plugin-bundle-size";
import pkg from "./package.json";

const fileExtensions = [".js", ".jsx", ".ts", ".tsx"];

const sourcemapOption = process.env.PROD ? undefined : "inline";

const replaceNodeOptions = {
  delimiters: ["", ""],
  values: {
    "/*ROLLUP_REPLACE_NODE": "",
    "ROLLUP_REPLACE_NODE*/": ""
  }
};

const replaceBrowserOptions = {
  delimiters: ["", ""],
  values: {
    "/*ROLLUP_REPLACE_BROWSER": "",
    "ROLLUP_REPLACE_BROWSER*/": ""
  }
};

let typescriptPluginOptions = {
  tsconfig: "../../tsconfig.json",
  exclude: ["./test/**/*"],
  clean: process.env.PROD ? true : false,
  objectHashIgnoreUnknownHack: true
};
let babelPluginOptions = {
  exclude: ["node_modules/**", "./test/**/*"],
  extensions: fileExtensions,
  presets: ["@babel/preset-env", "@babel/typescript"],
  plugins: [
    ["@babel/plugin-transform-typescript"],
    ["@babel/plugin-proposal-class-properties"],
    ["@babel/plugin-proposal-object-rest-spread"]
  ]
};

const plugins = [
  resolve({
    preferBuiltins: true,
    extensions: fileExtensions
  }),
  commonjs({ sourceMap: false }),
  json(),
  globals(),
  builtins(),
  babel(babelPluginOptions),
  process.env.PROD ? compiler() : undefined,
  process.env.PROD ? bundleSize() : undefined
];

const libBundles = [
  {
    input: "./lib/index.ts",
    output: {
      file: pkg.module,
      format: "esm",
      sourcemap: sourcemapOption
    },
    watch: {
      clearScreen: false
    },
    plugins: [replace(replaceBrowserOptions), ...plugins]
  },
  {
    input: "./lib/index.ts",
    output: {
      file: pkg.browser,
      format: "iife",
      sourcemap: sourcemapOption,
      name: "WASI"
    },
    watch: {
      clearScreen: false
    },
    plugins: [replace(replaceBrowserOptions), ...plugins]
  },
  {
    input: "./lib/index.ts",
    output: {
      file: pkg.main,
      format: "cjs",
      sourcemap: sourcemapOption
    },
    watch: {
      clearScreen: false
    },
    plugins: [replace(replaceNodeOptions), ...plugins]
  }
];

export default libBundles;
