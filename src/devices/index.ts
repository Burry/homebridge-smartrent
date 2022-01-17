import { LeakSensorData } from './leakSensor';
import { LockData } from './lock';
import { SwitchData } from './switch';

export * from './base';
export * from './leakSensor';
export * from './lock';
export * from './switch';

export type DeviceDataUnion = LeakSensorData | LockData | SwitchData;
