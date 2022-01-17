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

    this.pluginPath = `${this.homebridgeStoragePath}/smartrent`;
    this.sessionPath = `${this.pluginPath}/session.json`;

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
      const authClient = new SmartRentAuthClient();
      const { email, password, tfaCode } = payload;
      if (!email) {
        console.error('Email required');
        return { code: 401, message: 'Email required' };
      }
      if (!password) {
        console.error('Password required');
        return { code: 401, message: 'Password required' };
      }
      let sessionData = await authClient.getSession({
        username: email,
        password,
      });
      if (SmartRentAuthClient.isTfaSession(sessionData)) {
        if (!tfaCode) {
          console.error('2FA code required');
          return { code: 401, message: '2FA code required' };
        }
        sessionData = await authClient.getTfaSession({
          tfa_api_token: sessionData.tfa_api_token,
          token: tfaCode,
        });
      }
      if (sessionData && sessionData.accessToken) {
        if (!fs.existsSync(this.pluginPath)) {
          await fsPromises.mkdir(this.pluginPath);
        }
        await fsPromises.writeFile(
          this.sessionPath,
          JSON.stringify(sessionData, null, 2)
        );
        console.info('Saved session to', this.sessionPath);
        return { code: 200 };
      }
      throw new RequestError('Failed to login to SmartRent', {
        message: 'No access token returned',
      });
    } catch (error) {
      throw new RequestError('Failed to login to SmartRent', {
        message: error.message,
      });
    }
  }
}

(() => new PluginUiServer())();
