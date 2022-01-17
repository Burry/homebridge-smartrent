import { SmartRentPlatform } from '../platform';
import { SmartRentApiClient } from './client';
import {
  BaseDeviceResponse,
  BaseDeviceAttributes,
  DeviceDataUnion,
} from '../devices';

type UnitData = {
  building: string;
  city: string;
  country: string | null;
  floor: string;
  group: {
    city: string;
    country: string;
    group_white_label_config: null;
    id: number;
    marketing_name: string;
    organization_id: number;
    parking_enabled: false;
    property_code: string;
    rentcafe_id: null;
    state: string;
    store_url: null;
    street_address_1: string;
    street_address_2: string;
    sync_interval: number;
    temperature_scale: string;
    timezone: string;
    uuid: string;
    zip: string;
  };
  group_id: number;
  has_hub: boolean;
  hub: {
    connected_to_community_wifi: boolean;
    connection: string;
    firmware: string;
    hub_account_id: number;
    id: number;
    online: number;
    serial: string;
    timezone: null;
    type: string;
    unit_id: number;
    wifi_supported: boolean;
  };
  hub_id: number;
  id: number;
  image_url: string;
  marketing_name: string;
  parking_enabled: boolean;
  portal_only: boolean;
  ring_enabled: boolean;
  state: string;
  street_address_1: string;
  street_address_2: string;
  temperature_scale: string;
  timezone: string;
  unit_code: string;
  zip: string;
};

type UnitRecords = {
  current_page: 1;
  records: UnitData[];
  total_pages: 1;
  total_records: 1;
};

type RoomRecordsData = {
  icon: string | null;
  id: number;
  name: string;
  devices: DeviceDataUnion[];
};

type RoomRecords = {
  data: RoomRecordsData[];
};

export class SmartRentApi {
  public readonly client: SmartRentApiClient;

  constructor(private readonly platform: SmartRentPlatform) {
    this.client = new SmartRentApiClient(platform);
  }

  public async discoverDevices() {
    const unitRecords = await this.client.get<UnitRecords>('/units');
    const unitRecordsData = unitRecords.records;
    // Get either the specified unit or the first one
    const unitName = this.platform.config.unitName;
    const unitData = unitName
      ? unitRecordsData.find(unit => unit.marketing_name === unitName)
      : unitRecordsData[0];
    if (!unitData) {
      this.platform.log.error(`Unit ${unitName} not found`);
      return [];
    }

    // Get the unit's hub
    const hubId = unitData.hub_id;
    if (!hubId) {
      this.platform.log.error('No SmartRent hub found');
      return [];
    }

    // Get the unit's rooms
    const rooms = await this.client.get<RoomRecords>(`/hubs/${hubId}/rooms`);
    const roomsData = rooms.data;
    this.platform.log.info(`Found ${roomsData.length} rooms`);

    // Get the unit's devices
    const devicesData = roomsData.reduce(
      (acc: DeviceDataUnion[], room) => [...acc, ...room.devices],
      []
    );
    if (devicesData.length) {
      this.platform.log.info(`Found ${devicesData.length} devices`);
    } else {
      this.platform.log.error('No devices found');
    }

    return devicesData;
  }

  public async getState<Device extends BaseDeviceResponse>(
    hubId: string,
    deviceId: string
  ) {
    const lockData = await this.client.get<Device>(
      `/hubs/${hubId}/devices/${deviceId}`
    );
    return lockData.data.attributes;
  }

  public async setState<
    Device extends BaseDeviceResponse,
    A extends BaseDeviceAttributes
  >(hubId: string, deviceId: string, attributes: Partial<A>) {
    const lockData = await this.client.patch<Device>(
      `/hubs/${hubId}/devices/${deviceId}`,
      { attributes }
    );
    return lockData.data.attributes;
  }
}
