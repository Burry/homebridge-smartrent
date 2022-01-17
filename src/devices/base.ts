type BatteryData<BatteryPowered extends boolean> = BatteryPowered extends true
  ? { battery_level: number; battery_powered: true }
  : { battery_level: null; battery_powered: false };

export type BaseDeviceAttributes = Record<
  string,
  string | number | boolean | null
>;

export type DeviceData<
  A extends BaseDeviceAttributes, // Attributes
  T extends string, // Device type
  B extends boolean // Battery powered
> = BatteryData<B> & {
  attributes: A;
  icon: string | null;
  id: number;
  inserted_at: string;
  name: string;
  online: boolean;
  pending_update: boolean;
  primary_lock: boolean;
  room: {
    icon: string | null;
    id: number;
    name: string;
    hub_id: number;
    inserted_at: string;
    updated_at: string;
  };
  show_on_dashboard: boolean;
  type: T;
  updated_at: string;
  valid_config: boolean;
  warning: boolean;
};

export interface Device<
  D extends DeviceData<A, string, boolean>,
  A extends BaseDeviceAttributes
> {
  data: D;
}

export type BaseDeviceResponse = {
  data: { attributes: BaseDeviceAttributes };
};
