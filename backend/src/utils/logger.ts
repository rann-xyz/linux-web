const LOG_LEVELS = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
};

export const logger = {
  error: (message: string, meta?: any) => {
    console.error(`[${LOG_LEVELS.error}] ${message}`, meta || '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[${LOG_LEVELS.warn}] ${message}`, meta || '');
  },
  info: (message: string, meta?: any) => {
    console.log(`[${LOG_LEVELS.info}] ${message}`, meta || '');
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${LOG_LEVELS.debug}] ${message}`, meta || '');
    }
  },
};
