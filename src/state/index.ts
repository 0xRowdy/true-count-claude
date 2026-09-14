/**
 * The state module's public surface: Session lifecycle, the Decision log, statistics,
 * replay, and local persistence.
 *
 * Everything exported here is pure or takes its I/O through an injected `KeyValueStore`.
 * The AsyncStorage adapter (`./asyncStorage`) is deliberately absent — importing it here
 * would pull React Native into every consumer, including the Node test run.
 */

export * from "./types";
export * from "./session";
export * from "./stats";
export * from "./replay";
export * from "./schema";
export * from "./archive";
export * from "./store";
export * from "./repository";
