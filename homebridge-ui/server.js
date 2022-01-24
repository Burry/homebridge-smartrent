const {
  HomebridgePluginUiServer,
  RequestError,
} = require('@homebridge/plugin-ui-utils');
const fs = require('fs');
const fsPromises = fs.promises;
const { SmartRentAuthClient } = require('../dist/lib/auth');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.sessionPath = `${this.homebridgeStoragePath}/smartrent/session.json`;

    this.onRequest('/session', this.checkSession.bind(this));
    this.onRequest('/logout', this.clearSession.bind(this));
    this.onRequest('/login', this.login.bind(this));

    this.ready();
  }

  async checkSession() {
    try {
      if (fs.existsSync(this.sessionPath)) {
        return { code: 200 };
      }
      return { code: 404 };
    } catch (error) {
      throw new RequestError('Failed to check session', {
        message: error.message,
      });
    }
  }

  async clearSession() {
    try {
      if ((await this.checkSession()).code === 200) {
        await fsPromises.rm(this.sessionPath);
      }
      return { code: 200 };
    } catch (error) {
      throw new RequestError('Failed to delete auth token', {
        message: error.message,
      });
    }
  }

  async login(payload) {
    try {
      const { email, password, tfaCode } = payload;
      if (!email) {
        console.error('Email required');
        return { code: 401, message: 'Email required' };
      }
      if (!password) {
        console.error('Password required');
        return { code: 401, message: 'Password required' };
      }
      const authClient = new SmartRentAuthClient(this.homebridgeStoragePath);
      const accessToken = await authClient.getAccessToken({
        email,
        password,
        tfaCode,
      });
      if (accessToken) {
        return { code: 200 };
      }
      if (authClient.isTfaSession) {
        return {
          code: 403,
          message: tfaCode ? 'Invalid 2FA code' : '2FA code required',
        };
      }
      return { code: 403, message: 'Invalid email or password' };
    } catch (error) {
      throw new RequestError('Failed to login to SmartRent', {
        message: error.message,
      });
    }
  }
}

(() => new PluginUiServer())();
