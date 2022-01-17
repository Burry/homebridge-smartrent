import { API, PlatformPluginConstructor } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { SmartRentPlatform } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(
    PLATFORM_NAME,
    SmartRentPlatform as unknown as PlatformPluginConstructor
  );
};
