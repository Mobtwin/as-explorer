import { createLogger, format, transports } from 'winston';
import fs from 'fs';
import path from 'path';

const { combine, timestamp, printf } = format;
const logFolder = './logs';
const logFilePath = './logs/logs.log';

// Create the "logs" folder if it doesn't exist
if (!fs.existsSync(logFolder)) {
  fs.mkdirSync(logFolder);
}

// Define log format
const logFormat = printf(({ timestamp, level, message }) => {
  return `${timestamp} - ${level.toUpperCase()} - ${message}`;
});

// Create logger instance
const logger = createLogger({
  level: 'debug',
  format: combine(timestamp(), logFormat),
  transports: [
    new transports.File({
      filename: logFilePath,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 2,
    }),
  ],
});

export default logger;
