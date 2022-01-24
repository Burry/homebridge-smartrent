import { Logger } from 'homebridge';
import axios, { AxiosResponse, AxiosInstance, AxiosError } from 'axios';
import { URLSearchParams } from 'url';
import { API_URL, AUTH_CLIENT_HEADERS } from './request';

type LoginCredentials = {
  username: string;
  password: string;
};

type TfaCredentials = {
  tfa_api_token: string;
  token: string;
};

type Credentials = LoginCredentials | TfaCredentials;

type OAuthSessionData = {
  user_id: number;
  access_token: string;
  refresh_token: string;
  expires: number;
};

type TfaSessionData = {
  tfa_api_token: string;
};

type SessionData = OAuthSessionData | TfaSessionData;

type SessionApiResponse = {
  data: SessionData;
};

export type Session = {
  userId: number;
  accessToken: string;
  refreshToken: string;
  expires: Date;
};

export class SmartRentAuthClient {
  private session?: Session;
  private readonly log: Logger;
  private readonly client: AxiosInstance;

  constructor(log?: Logger, session?: Session) {
    this.session = session;
    this.log = log ?? console;
    this.client = this._initializeClient();
  }

  /**
   * Initialize Axios instance for SmartRent OAuth token requests
   * @returns Axios instance
   */
  private _initializeClient() {
    const authClient = axios.create({
      baseURL: API_URL,
      method: 'POST',
      headers: AUTH_CLIENT_HEADERS,
    });
    authClient.interceptors.response.use(this._handleResponse.bind(this));
    return authClient;
  }

  /**
   * Log the SmartRent API response
   * @param response Axios response
   * @returns SmartRent response data payload
   */
  private _handleResponse(response: AxiosResponse) {
    this.log.debug('Response:', JSON.stringify(response.data, null, 2));
    return response;
  }

  /**
   * Attempt to start a new OAuth 2 session
   * @param credentials username/password or two-factor authentication credentials
   * @returns OAuth 2 session or two-factor authentication data
   */
  private async _requestSession(credentials: Credentials) {
    const credentialParams = new URLSearchParams(credentials);
    const response = await this.client.post<SessionApiResponse>(
      '/sessions',
      credentialParams,
      {
        headers: {
          ...AUTH_CLIENT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
      }
    );
    const authData = response.data.data;
    return authData;
  }

  /**
   * Format and store session data from SmartRent API
   * @param data SmartRent session data
   * @param refreshed Whether the session was refreshed
   * @returns formatted session data
   */
  private _storeSession = (data: OAuthSessionData, refreshed?: boolean) => {
    this.session = {
      userId: data.user_id,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expires: new Date(1000 * data.expires - 100),
    };
    this.log.info(`${refreshed ? 'Refreshed' : 'Created'} SmartRent session`);
    return this.session;
  };

  /**
   * Get the stored session or a refreshed session if expired
   * @returns OAuth2 session data
   */
  private async _getStoredOrRefreshedSession() {
    // Return the stored session if it's valid
    if (!!this.session && new Date(this.session.expires) > new Date()) {
      return this.session;
    }

    // Refresh the session if it's expired
    if (this.session) {
      const refreshToken = this.session.refreshToken;
      if (!refreshToken) {
        this.log.error('No refresh token');
        return;
      }
      try {
        const response = await this.client.post<{ data: OAuthSessionData }>(
          '/tokens',
          undefined,
          {
            headers: {
              ...AUTH_CLIENT_HEADERS,
              'Authorization-X-Refresh': refreshToken,
            },
          }
        );
        const sessionData = response.data.data;
        return this._storeSession(sessionData, true);
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          this.log.error('Failed to refresh session');
        } else {
          this.log.error(
            'Unknown error while attempting to refresh session',
            error
          );
        }
      }
    }
  }

  /**
   * Get a new session
   * @returns OAuth2 session data
   */
  private async _createSession(credentials: LoginCredentials) {
    // Create a new session using the given credentials
    if (!credentials.username) {
      this.log.error('No email set in Homebridge config');
    }
    if (!credentials.password) {
      this.log.error('No password set in Homebridge config');
    }
    if (!credentials.username || !credentials.password) {
      return;
    }

    let sessionData: SessionData;

    try {
      sessionData = await this._requestSession(credentials);
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        if (axiosError.response.status === 403) {
          this.log.error('Invalid email or password');
        } else {
          this.log.error('Failed to create session');
        }
      } else {
        this.log.error(
          'Unknown error while attempting to create session',
          error
        );
      }
      return;
    }

    // If authentication is complete, return the session
    if (SmartRentAuthClient.isOauthSession(sessionData)) {
      return this._storeSession(sessionData);
    }
    // If 2FA is enabled, return the two-factor authentication data
    if (SmartRentAuthClient.isTfaSession(sessionData)) {
      this.log.debug('2FA enabled');
      return sessionData;
    }

    this.log.error('Failed to create session');
  }

  public static isOauthSession = (
    sessionData?: object
  ): sessionData is OAuthSessionData =>
    !!sessionData && 'access_token' in sessionData;

  public static isTfaSession = (
    sessionData?: object
  ): sessionData is TfaSessionData =>
    !!sessionData && 'tfa_api_token' in sessionData;

  /**
   * Get the current session if valid, a new session, or a refreshed session
   * @returns OAuth2 session data
   */
  public async getSession(credentials: LoginCredentials) {
    // Return the stored or refreshed session
    const session = await this._getStoredOrRefreshedSession();
    if (session) {
      return session;
    }
    // Create a new session using the given credentials
    return this._createSession(credentials);
  }

  /**
   * Get a new session using the given 2FA credentials
   * @param credentials two-factor authentication credentials
   * @returns OAuth2 session data
   */
  public async getTfaSession(credentials: TfaCredentials) {
    try {
      const sessionData = await this._requestSession(credentials);
      if (SmartRentAuthClient.isOauthSession(sessionData)) {
        return this._storeSession(sessionData);
      }
      this.log.error('Failed to create two-factor authenticated session');
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        if (axiosError.response.status === 403) {
          this.log.error('Invalid 2FA token');
        } else {
          this.log.error('Failed to create 2FA session');
        }
      } else {
        this.log.error(
          'Unknown error while attempting to create two-factor authenticated session'
        );
      }
    }
  }

  public setSession(session: Session) {
    this.session = session;
  }

  /**
   * Get the stored access token or a refreshed token if it's expired
   * @returns OAuth2 access token
   */
  public async getAccessToken() {
    const session = await this._getStoredOrRefreshedSession();
    if (session) {
      return session.accessToken;
    }
    this.log.warn('No SmartRent session');
  }
}
