import { Logger } from 'homebridge';

export let logger: Logger | Console = console;

export const initLogger = (homebridgeLogger: Logger) => {
  logger = homebridgeLogger;
  return logger;
};
