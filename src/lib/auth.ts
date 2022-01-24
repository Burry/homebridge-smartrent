import { Logger } from 'homebridge';
import axios, { AxiosResponse, AxiosInstance, AxiosError } from 'axios';
import { existsSync, promises as fsPromises } from 'fs';
import { URLSearchParams } from 'url';
import { resolve as pathResolve } from 'path';
import { SmartRentPlatformConfig } from './config';
import { API_URL, AUTH_CLIENT_HEADERS } from './request';

/** Credentials stored in config.json */
type ConfigCredentials = Pick<
  SmartRentPlatformConfig,
  'email' | 'password' | 'tfaCode'
>;

/** Login credentials used in SmartRent session request */
type LoginCredentials = {
  username: string;
  password: string;
};

/** Two-factor authentication credentials used in SmartRent session request */
type TfaCredentials = {
  tfa_api_token: string;
  token: string;
};

type Credentials = LoginCredentials | TfaCredentials;

/** OAuth data returned by SmartRent session response */
type OAuthSessionData = {
  user_id: number;
  access_token: string;
  refresh_token: string;
  expires: number;
};

/** 2FA data returned by SmartRent two-factor authenticated session response */
type TfaSessionData = {
  tfa_api_token: string;
};

type SessionData = OAuthSessionData | TfaSessionData;

type SessionApiResponse = {
  data: SessionData;
  error?: string;
};

/** Session stored in session.json */
export type Session = {
  userId: number;
  accessToken: string;
  refreshToken: string;
  expires: Date;
};

/**
 * SmartRent Auth client
 */
export class SmartRentAuthClient {
  public isTfaSession = false;
  private session?: Session;
  private storagePath = '~/.homebridge';
  private pluginPath = '~/.homebridge/smartrent';
  private sessionPath = '~/.homebridge/smartrent/session.json';
  private readonly log: Logger;
  private readonly client: AxiosInstance;

  constructor(storagePath: string, log?: Logger) {
    this.storagePath = storagePath;
    this.pluginPath = pathResolve(this.storagePath, 'smartrent');
    this.sessionPath = pathResolve(this.pluginPath, 'session.json');
    this.log = log ?? console;
    this.client = this._initializeClient();
  }

  private static _isOauthSession = (
    sessionData?: object
  ): sessionData is OAuthSessionData =>
    !!sessionData && 'access_token' in sessionData;

  private static _isTfaSession = (
    sessionData?: object
  ): sessionData is TfaSessionData =>
    !!sessionData && 'tfa_api_token' in sessionData;

  private static _getExpireDate(milliseconds: number) {
    return new Date(1000 * milliseconds - 100);
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
   * Request a new session using either basic or 2FA credentials
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
   * Read the session from session.json and store in this.session
   * @returns Session data
   */
  private async _readStoredSession() {
    if (existsSync(this.sessionPath)) {
      const sessionString = await fsPromises.readFile(this.sessionPath, 'utf8');
      const session = JSON.parse(sessionString) as Session;
      this.session = session;
    } else if (!existsSync(this.pluginPath)) {
      await fsPromises.mkdir(this.pluginPath);
    }
  }

  /**
   * Format session data from SmartRent API and store to disk
   * @param data SmartRent session data
   * @param refreshed Whether the session was refreshed
   * @returns formatted session data
   */
  private async _storeSession(data: OAuthSessionData, refreshed = false) {
    const session = {
      userId: data.user_id,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expires: SmartRentAuthClient._getExpireDate(data.expires),
    };
    this.session = session;
    this.log.info(`${refreshed ? 'Refreshed' : 'Started'} SmartRent session`);
    const sessionStr = JSON.stringify(this.session, null, 2);
    await fsPromises.writeFile(this.sessionPath, sessionStr);
    this.log.debug('Saved session to', this.sessionPath);
    return this.session;
  }

  /**
   * Start a new session
   * @param credentials email, password, and 2FA credentials
   * @returns OAuth2 session data
   */
  private async _startSession(credentials: ConfigCredentials) {
    const { email, password, tfaCode } = credentials;

    // Create a new session using the given credentials
    if (!email && !password) {
      this.log.error('No email or password configured');
      return;
    } else if (!email) {
      this.log.error('No email configured');
      return;
    } else if (!password) {
      this.log.error('No password configured');
      return;
    }

    // Attempt to start a session using the given email and password
    const sessionData = await this._startBasicSession({
      username: email,
      password,
    });

    // If authentication is complete, return the session
    if (SmartRentAuthClient._isOauthSession(sessionData)) {
      this.isTfaSession = false;
      return this._storeSession(sessionData);
    }

    // If 2FA is enabled, start a 2FA session
    if (SmartRentAuthClient._isTfaSession(sessionData)) {
      this.log.debug('2FA enabled');
      this.isTfaSession = true;
      if (!tfaCode) {
        this.log.error('Account has 2FA enabled but no 2FA code is configured');
        return;
      }
      return this._startTfaSession({
        tfa_api_token: sessionData.tfa_api_token,
        token: tfaCode,
      });
    }

    this.log.error('Failed to create session');
  }

  /**
   * Get a new session using the given username & password
   * @param credentials username & password credentials
   * @returns OAuth2 session data
   */
  private async _startBasicSession(credentials: LoginCredentials) {
    try {
      return this._requestSession(credentials);
    } catch (error) {
      this._handleResponseError(
        error,
        'Invalid email or password',
        'create session'
      );
    }
  }

  /**
   * Get a new session using the given 2FA credentials
   * @param credentials two-factor authentication credentials
   * @returns OAuth2 session data
   */
  private async _startTfaSession(credentials: TfaCredentials) {
    try {
      const sessionData = await this._requestSession(credentials);
      if (SmartRentAuthClient._isOauthSession(sessionData)) {
        return this._storeSession(sessionData);
      }
      this.log.error('Failed to create 2FA session');
    } catch (error) {
      this._handleResponseError(
        error,
        'Invalid 2FA code',
        'create 2FA session'
      );
    }
  }

  /**
   * Refresh a session
   * @returns OAuth2 session data
   */
  private async _refreshSession() {
    const refreshToken = this.session?.refreshToken;
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
      this._handleResponseError(
        error,
        'Refresh token expired',
        'refresh session'
      );
    }
  }

  private _handleResponseError(
    error: unknown,
    authMsg: string,
    action: string
  ) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      if (
        axiosError.response.status === 401 ||
        axiosError.response.status === 403
      ) {
        this.log.error(authMsg);
      } else {
        this.log.error(`Failed to ${action}`);
      }
    } else {
      this.log.error(`Unknown error while attempting to ${action}`, error);
    }
  }

  /**
   * Get the current session if valid, a new session, or a refreshed session
   * @returns OAuth2 session data
   */
  private async _getSession(credentials: ConfigCredentials) {
    await this._readStoredSession();

    // Return the stored session if it's valid
    if (!!this.session && new Date(this.session.expires) > new Date()) {
      return this.session;
    }

    // Refresh the session if it's expired
    if (this.session) {
      this.log.warn('Access token expired, attempting to refresh session');
      const refreshedSession = await this._refreshSession();
      if (refreshedSession) {
        return refreshedSession;
      }
    }

    // Create a new session using the given credentials
    return this._startSession(credentials);
  }

  /**
   * Get the stored access token or a refreshed token if it's expired
   * @returns OAuth2 access token
   */
  public async getAccessToken(credentials: ConfigCredentials) {
    const session = await this._getSession(credentials);
    if (session && 'accessToken' in session) {
      return session.accessToken;
    }
    this.log.error('Failed to authenticate with SmartRent');
  }
}
