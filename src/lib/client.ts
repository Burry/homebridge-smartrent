import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import { existsSync, promises as fsPromises } from 'fs';
import { API_URL, API_CLIENT_HEADERS } from './request';
import { SmartRentAuthClient, Session } from './auth';
import { logger } from './logger';
import { SmartRentPlatform } from '../platform';

export class SmartRentApiClient {
  private authClient: SmartRentAuthClient;
  private readonly apiClient: AxiosInstance;

  constructor(private readonly platform: SmartRentPlatform) {
    this.authClient = new SmartRentAuthClient();
    this.apiClient = this._initializeApiClient();
  }

  /**
   * Initialize Axios instance for SmartRent API requests
   * @returns Axios instance
   */
  private _initializeApiClient() {
    const apiClient = axios.create({
      baseURL: API_URL,
      headers: API_CLIENT_HEADERS,
    });
    apiClient.interceptors.request.use(
      this._handleRequest.bind(this),
      logger.error
    );
    apiClient.interceptors.response.use(
      this._handleResponse.bind(this),
      logger.error
    );
    return apiClient;
  }

  /**
   * Attach the access token to the SmartRent API request and log the request
   * @param config Axios request config
   * @returns Axios request config
   */
  private async _handleRequest(config: AxiosRequestConfig) {
    const accessToken = await this.authClient.getAccessToken();
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${accessToken}`,
    };
    this.platform.log.debug('Request:', JSON.stringify(config, null, 2));
    return config;
  }

  /**
   * Log the SmartRent API response
   * @param response Axios response
   * @returns SmartRent response data payload
   */
  private _handleResponse(response: AxiosResponse) {
    this.platform.log.debug(
      'Response:',
      JSON.stringify(response.data, null, 2)
    );
    return response;
  }

  /**
   * Get the current session if valid, a new session, or a refreshed session
   * @returns true if a session exists, false otherwise
   */
  public async authenticate() {
    const pluginPath = `${this.platform.api.user.storagePath()}/smartrent`;
    const sessionPath = `${pluginPath}/session.json`;

    if (existsSync(sessionPath)) {
      const sessionString = await fsPromises.readFile(sessionPath, 'utf8');
      const session = JSON.parse(sessionString) as Session;
      this.authClient.setSession(session);
    } else if (!existsSync(pluginPath)) {
      await fsPromises.mkdir(pluginPath);
    }

    const accessToken = await this.authClient.getAccessToken();
    if (accessToken) {
      return true;
    }

    const { email, password, tfaCode } = this.platform.config;
    if (!email) {
      logger.error('No email set in Homebridge config');
    }
    if (!password) {
      logger.error('No password set in Homebridge config');
    }
    if (!email || !password) {
      return false;
    }

    let sessionData = await this.authClient.getSession({
      username: email,
      password,
    });
    if (SmartRentAuthClient.isTfaSession(sessionData)) {
      if (!tfaCode) {
        logger.error('No 2FA code set in Homebridge config');
        return false;
      }
      sessionData = await this.authClient.getTfaSession({
        tfa_api_token: sessionData.tfa_api_token,
        token: tfaCode,
      });
    }

    if (sessionData?.accessToken) {
      await fsPromises.writeFile(
        sessionPath,
        JSON.stringify(sessionData, null, 2)
      );
      logger.info('Saved session to', sessionPath);
      return true;
    }

    return false;
  }

  // API request methods

  public async get<T, D = unknown>(
    path: string,
    config?: AxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.get<T>(path, config);
    return response.data;
  }

  public async post<T, D = unknown>(
    path: string,
    data?: D,
    config?: AxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.post<T>(path, data, config);
    return response.data;
  }

  public async patch<T, D = unknown>(
    path: string,
    data?: D,
    config?: AxiosRequestConfig<D>
  ) {
    const response = await this.apiClient.patch<T>(path, data, config);
    return response.data;
  }
}
