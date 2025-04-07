import { IChatContext, IChatRequestMessage } from 'intellichat/types';
import { urlJoin } from 'utils/util';
import OpenAIChatService from './OpenAIChatService';
import DeepSeek from '../../providers/DeepSeek';
import INextChatService from './INextCharService';

export default class DeepSeekChatService
  extends OpenAIChatService
  implements INextChatService
{
  constructor(chatContext: IChatContext) {
    super(chatContext);
    this.provider = DeepSeek;
  }

  protected async makeRequest(
    messages: IChatRequestMessage[],
    msgId?: string,
  ): Promise<Response> {
    const { base, key } = this.apiSettings;
    const url = urlJoin('/chat/completions', base);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(await this.makePayload(messages, msgId)),
      signal: this.abortController.signal,
    });
    return response;
  }
}
