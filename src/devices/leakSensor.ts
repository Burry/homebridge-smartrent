import { DeviceData, Device } from './base';

export type LeakSensorAttributes = { leak: boolean };

export type LeakSensorData = DeviceData<
  LeakSensorAttributes,
  'sensor_notification',
  true
>;

export type LeakSensor = Device<LeakSensorData, LeakSensorAttributes>;
