import { DeviceData, Device } from './base';

export type LockAttributes = {
  access_codes_supported: boolean;
  locked: boolean;
};

export type LockData = DeviceData<LockAttributes, 'entry_control', true>;

export type Lock = Device<LockData, LockAttributes>;
