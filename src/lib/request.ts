export const API_URL = 'https://control.smartrent.com/api/v1';

export const APP_VERSION = '2.23.0';

const USER_AGENT = `SmartRent/${APP_VERSION} (com.smartrent.resident; build:1672; iOS 15.2.1) Alamofire/4.9.1`;

const COMMON_HEADERS = {
  Connection: 'keep-alive',
  'User-Agent': USER_AGENT,
  'Accept-Language': 'en-US;q=1.0',
  'Accept-Encoding': 'gzip;q=1.0, compress;q=0.5',
};

export const AUTH_CLIENT_HEADERS = {
  ...COMMON_HEADERS,
  Accept: '*/*',
};

export const API_CLIENT_HEADERS = {
  ...COMMON_HEADERS,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-AppVersion': `ios-resapp-${APP_VERSION}`,
};
