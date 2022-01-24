import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import { API_URL, API_CLIENT_HEADERS } from './request';
import { SmartRentAuthClient } from './auth';
import { SmartRentPlatform } from '../platform';

export class SmartRentApiClient {
  private authClient: SmartRentAuthClient;
  private readonly apiClient: AxiosInstance;

  constructor(private readonly platform: SmartRentPlatform) {
    this.authClient = new SmartRentAuthClient(
      platform.api.user.storagePath(),
      platform.log
    );
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
    apiClient.interceptors.request.use(this._handleRequest.bind(this));
    apiClient.interceptors.response.use(this._handleResponse.bind(this));
    return apiClient;
  }

  /**
   * Get the SmartRent API access token
   * @returns Oauth access token
   */
  public async getAccessToken() {
    return this.authClient.getAccessToken({
      email: this.platform.config.email,
      password: this.platform.config.password,
      tfaCode: this.platform.config.tfaCode,
    });
  }

  /**
   * Attach the access token to the SmartRent API request and log the request
   * @param config Axios request config
   * @returns Axios request config
   */
  private async _handleRequest(config: AxiosRequestConfig) {
    const accessToken = await this.getAccessToken();
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
