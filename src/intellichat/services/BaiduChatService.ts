import Debug from 'debug';
import { date2unix, urlJoin } from 'utils/util';
import Baidu from '../../providers/Baidu';
import { IChatContext, IChatRequestMessage } from '../types';
import INextChatService from './INextCharService';
import OpenAIChatService from './OpenAIChatService';

const debug = Debug('5ire:intellichat:BaiduChatService');

function formatDateToISO(date: Date): string {
  return `${date.toISOString().split('.')[0]}Z`;
}
export interface IBaiduToken {
  token: string;
  userId: string;
  expiredAt: string;
  createdAt: string;
}

export default class BaiduChatService
  extends OpenAIChatService
  implements INextChatService
{
  constructor(context: IChatContext) {
    super(context);
    this.provider = Baidu;
  }

  private async geToken(): Promise<string> {
    const cachedToken = localStorage.getItem('baidu-token');
    if (!cachedToken) {
      debug('No access token found, requesting...');
      return (await this.requestToken()).token;
    }
    const { expiredAt, token } = JSON.parse(cachedToken) as IBaiduToken;
    if (date2unix(new Date()) >= date2unix(new Date(expiredAt))) {
      debug('Access token expired, requesting...');
      return (await this.requestToken()).token;
    }
    debug('Using cached access token:', token);
    return token;
  }

  private async requestToken(): Promise<IBaiduToken> {
    const path = '/v1/BCE-BEARER/token?expireInSeconds=2592000';
    const timeStamp = formatDateToISO(new Date());
    const authString = await this.createAuthString(path, timeStamp);
    const response = await fetch(`https://iam.bj.baidubce.com${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authString.trim(),
        'x-bce-date': timeStamp,
      },
    });
    const result = await response.json();
    const token = {
      userId: result.userId,
      token: result.token,
      expiredAt: result.expireTime,
      createdAt: result.createTime,
    };
    debug('Request Bearer Token: ', token);
    localStorage.setItem('baidu-token', JSON.stringify(token));
    return token;
  }

  // /v1/BCE-BEARER/token?expireInSeconds=2592000
  private async createAuthString(
    uri: string,
    timestamp: string,
  ): Promise<string> {
    const { key, secret } = this.apiSettings;
    const signedHeaders = 'content-type;host;x-bce-date';
    const url = new URL('https://iam.bj.baidubce.com');
    const [path, query] = uri.split('?');
    const host = encodeURIComponent(url.host);
    const canonicalURI = encodeURIComponent(path).replace(/%2F/g, '/');
    const queries = query.split('&');
    const canonicalQueryString = queries
      .map((q) => {
        const [key, val] = q.split('=');
        return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
      })
      .join('&');
    const canonicalRequest = `GET\n${canonicalURI}\n${canonicalQueryString}\ncontent-type:${encodeURIComponent(
      'application/json',
    )}\nhost:${host}\nx-bce-date:${encodeURIComponent(timestamp)}`;
    // debug(`canonicalRequest:\n\n${canonicalRequest}`);

    const expirationPeriodInSeconds = 2592000;
    // authStringPrefix = bce-auth-v1/{accessKeyId}/{timestamp}/{expirationPeriodInSeconds}
    const authStringPrefix = `bce-auth-v1/${key}/${timestamp}/${expirationPeriodInSeconds}`;
    // debug('authStringPrefix:', authStringPrefix);
    const signingKey = await window.electron.crypto.hmacSha256Hex(
      authStringPrefix,
      secret as string,
    );
    // debug('signingKey:', signingKey);
    const signature = await window.electron.crypto.hmacSha256Hex(
      canonicalRequest,
      signingKey,
    );
    // debug('signature:', signature);
    // bce-auth-v1/{accessKeyId}/{timestamp}/{expirationPeriodInSeconds }/{signedHeaders}/{signature}
    return `bce-auth-v1/${key}/${timestamp}/${expirationPeriodInSeconds}/${signedHeaders}/${signature}`;
  }

  protected async makeRequest(
    messages: IChatRequestMessage[],
    msgId?: string,
  ): Promise<Response> {
    const payload = await this.makePayload(messages, msgId);
    debug('About to make a request, payload:\r\n', payload);
    const { base } = this.apiSettings;

    const token = await this.geToken();
    payload.model = (this.getModelName() as string).toLowerCase();

    const url = urlJoin('/v2/chat/completions', base);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: this.abortController.signal,
    });
    return response;
  }
}
