export type { AuditSink, AuditQueryFilter, AuditQueryResult } from "./types.js";
export { createMemoryAuditSink } from "./memory-sink.js";
export type { MemoryAuditSinkOptions } from "./memory-sink.js";
export { createCompositeAuditSink } from "./composite-sink.js";
export { createJsonAuditSink } from "./json-sink.js";
export type { JsonAuditSinkOptions, LogWriter } from "./json-sink.js";
