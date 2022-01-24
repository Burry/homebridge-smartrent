import {
  API,
  DynamicPlatformPlugin,
  Logger,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import {
  AccessoryContext,
  SmartRentAccessory,
  LockAccessory,
  LeakSensorAccessory,
  SwitchAccessory,
} from './accessories';
import { SmartRentApi } from './lib/api';
import { DeviceDataUnion } from './devices';
import { SmartRentPlatformConfig } from './lib/config';

/**
 * SmartRentPlatform
 */
export class SmartRentPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly smartRentApi: SmartRentApi;
  public readonly accessories: SmartRentAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: SmartRentPlatformConfig,
    public readonly api: API
  ) {
    log.debug(`Initializing ${this.config.name} platform`);
    this.smartRentApi = new SmartRentApi(this);
    log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', async () => {
      if (await this.smartRentApi.client.getAccessToken()) {
        await this.discoverDevices();
      }
      log.debug('Executed didFinishLaunching callback');
    });
  }

  configureAccessory(accessory: SmartRentAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  private _initAccessory(
    uuid: string,
    device: DeviceDataUnion,
    accessory?: SmartRentAccessory
  ) {
    // create the accessory handler for the restored accessory
    // this is imported from `platformAccessory.ts`
    let Accessory:
      | typeof LeakSensorAccessory
      | typeof LockAccessory
      | typeof SwitchAccessory;
    switch (device.type) {
      case 'sensor_notification':
        if ('leak' in device.attributes) {
          Accessory = LeakSensorAccessory;
        } else {
          this.log.error(`Unknown device type: ${device.type}`);
          return;
        }
        break;
      case 'entry_control':
        Accessory = LockAccessory;
        break;
      case 'switch_binary':
        Accessory = SwitchAccessory;
        break;
      default:
        this.log.error(
          `Unknown device type: ${(device as DeviceDataUnion).type}`
        );
        return;
    }

    // Create the accessory if it doesn't already exist
    let accessoryExists = true;
    if (accessory) {
      // the accessory already exists
      this.log.info(
        'Restoring existing accessory from cache:',
        accessory.displayName
      );
      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      accessory.context.device = device;
      this.api.updatePlatformAccessories([accessory]);
    } else {
      accessoryExists = false;
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', device.name);
      // create a new accessory
      accessory = new this.api.platformAccessory<AccessoryContext>(
        device.name,
        uuid
      );
      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
    }

    // create the accessory handler for the newly create accessory
    // this is imported from `platformAccessory.ts`
    new Accessory(this, accessory);

    if (!accessoryExists) {
      // link the accessory to the platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const devices = await this.smartRentApi.discoverDevices();

    // loop over the discovered devices and register each one if it has not already been registered
    const uuids = devices.map(device => {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.id.toString());
      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(
        accessory => accessory.UUID === uuid
      );
      this._initAccessory(uuid, device, existingAccessory);
      return uuid;
    });

    // remove platform accessories when no longer present
    this.accessories.forEach(existingAccessory => {
      if (!uuids.includes(existingAccessory.UUID)) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          existingAccessory,
        ]);
        this.log.info(
          'Removing existing accessory from cache:',
          existingAccessory.displayName
        );
      }
    });
  }
}
