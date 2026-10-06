export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type ConfiguredLogLevel = LogLevel | 'silent';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type LogFields = Record<string, unknown>;
export type LogContext = LogFields;

export type TraceContext = {
  trace_id: string;
  span_id: string;
  trace_flags?: number;
};

/** The same bounded record travels through stdout and the browser's injected sender. */
export type LogRecord = {
  schema_version: 1;
  timestamp: string;
  level: number;
  severity_text: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  service: string;
  environment: string;
  version: string;
  event: string;
  message: string;
  attributes: Record<string, JsonValue>;
  trace_id?: string;
  span_id?: string;
  trace_flags?: number;
};

export type Logger = {
  debug(fields: LogFields, message?: string): void;
  info(fields: LogFields, message?: string): void;
  warn(fields: LogFields, message?: string): void;
  error(fields: LogFields, message?: string): void;
  fatal(fields: LogFields, message?: string): void;
  child(fields: LogFields): Logger;
  isLevelEnabled(level: LogLevel): boolean;
  flush(): Promise<void>;
};

export type LoggerOptions = {
  service: string;
  environment: string;
  version: string;
  level?: ConfiguredLogLevel;
  now?: () => Date;
};
