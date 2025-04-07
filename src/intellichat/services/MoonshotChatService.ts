import Debug from 'debug';
import { IChatContext } from 'intellichat/types';
import Moonshot from 'providers/Moonshot';
import OpenAIChatService from './OpenAIChatService';
import INextChatService from './INextCharService';

// const debug = Debug('5ire:intellichat:MoonshotChatService');

export default class MoonshotChatService
  extends OpenAIChatService
  implements INextChatService
{
  constructor(context: IChatContext) {
    super(context);
    this.provider = Moonshot;
  }
}
