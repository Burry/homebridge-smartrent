import { PlatformAccessory } from 'homebridge';
import { DeviceDataUnion } from '../devices';

export * from './leakSensor';
export * from './lock';
export * from './switch';

export type AccessoryContext = { device: DeviceDataUnion };
export type SmartRentAccessory = PlatformAccessory<AccessoryContext>;
