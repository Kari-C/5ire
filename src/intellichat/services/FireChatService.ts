import Debug from 'debug';
import {
  IChatContext,
  IChatRequestMessage,
  IChatResponseMessage,
} from 'intellichat/types';

import Fire from 'providers/Fire';
import useAuthStore from 'stores/useAuthStore';
import FireReader from 'intellichat/readers/FireReader';
import { urlJoin } from 'utils/util';
import INextChatService from './INextCharService';
import OpenAIChatService from './OpenAIChatService';

const debug = Debug('5ire:intellichat:FireChatService');

export default class FireChatService
  extends OpenAIChatService
  implements INextChatService
{
  constructor(context: IChatContext) {
    super(context);
    this.provider = Fire;
  }

  protected getReaderType() {
    return FireReader;
  }

  private getUserId() {
    const { session } = useAuthStore.getState();
    return session?.user.id;
  }

  protected async makeRequest(
    messages: IChatRequestMessage[],
    msgId?: string
  ): Promise<Response> {
    const payload = await this.makePayload(messages, msgId);
    debug('About to make a request, payload:\r\n', payload);
    const { base } = this.apiSettings;
    const key = this.getUserId();
    if (!key) {
      throw new Error('User is not authenticated');
    }
    const url = urlJoin(`/v1/chat/completions`, base);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
      signal: this.abortController.signal,
    });
    return response;
  }
}
