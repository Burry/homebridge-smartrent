import { Service, CharacteristicValue } from 'homebridge';
import { SmartRentPlatform } from '../platform';
import type { SmartRentAccessory } from '.';
import { Lock, LockAttributes } from './../devices';

/**
 * Lock Accessory
 * An instance of this class is created for each accessory the platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LockAccessory {
  private service: Service;

  private state: {
    hubId: string;
    deviceId: string;
    locked: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
  };

  constructor(
    private readonly platform: SmartRentPlatform,
    private readonly accessory: SmartRentAccessory
  ) {
    this.state = {
      hubId: this.accessory.context.device.room.hub_id.toString(),
      deviceId: this.accessory.context.device.id.toString(),
      locked: {
        current: this.platform.Characteristic.LockTargetState.UNSECURED,
        target: this.platform.Characteristic.LockTargetState.UNSECURED,
      },
    };

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.accessory.context.device.id.toString()
      );

    // get the LockMechanism service if it exists, otherwise create a new LockMechanism service
    this.service =
      this.accessory.getService(this.platform.Service.LockMechanism) ||
      this.accessory.addService(this.platform.Service.LockMechanism);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    // see https://developers.homebridge.io/#/service/LockMechanism
    this.service
      .getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .on('get', this.handleLockCurrentStateGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.LockTargetState)
      .on('get', this.handleLockTargetStateGet.bind(this))
      .on('set', this.handleLockTargetStateSet.bind(this));
  }

  private _getLockStateCharacteristicValue(locked: boolean) {
    const currentValue = locked
      ? this.platform.Characteristic.LockTargetState.SECURED
      : this.platform.Characteristic.LockTargetState.UNSECURED;
    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Lock Current State" characteristic
   */
  async handleLockCurrentStateGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET LockCurrentState');
    const lockAttributes = await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    );
    const locked = lockAttributes.locked as boolean;
    const currentValue = this._getLockStateCharacteristicValue(locked);
    this.state.locked.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Lock Target State" characteristic
   */
  handleLockTargetStateGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET LockTargetState');
    return this.state.locked.target;
  }

  /**
   * Handle requests to set the "Lock Target State" characteristic
   */
  async handleLockTargetStateSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET LockTargetState:', value);
    this.state.locked.target = value;
    const lockAttributes = await this.platform.smartRentApi.setState<
      Lock,
      LockAttributes
    >(this.state.hubId, this.state.deviceId, { locked: !!value });
    const locked = lockAttributes.locked as boolean;
    this.state.locked.current = this._getLockStateCharacteristicValue(locked);
  }
}
