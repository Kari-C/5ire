import { IChatContext, IChatRequestMessage } from 'intellichat/types';
import { urlJoin } from 'utils/util';
import OpenAIChatService from './OpenAIChatService';
import Azure from '../../providers/Azure';
import INextChatService from './INextCharService';

export default class AzureChatService
  extends OpenAIChatService
  implements INextChatService
{
  constructor(chatContext: IChatContext) {
    super(chatContext);
    this.provider = Azure;
  }

  protected async makeRequest(
    messages: IChatRequestMessage[],
    msgId?:string
  ): Promise<Response> {
    const apiVersion = '2024-10-21';
    const { base, deploymentId, key } = this.apiSettings;
    const url = urlJoin(
      `/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`,
      base,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': key,
      },
      body: JSON.stringify(await this.makePayload(messages, msgId)),
      signal: this.abortController.signal,
    });
    return response;
  }
}
