import Debug from 'debug';
import {
  IChatContext,
  IChatRequestMessage,
  IChatRequestPayload,
  IChatMessage,
  IChatRequestMessageContent,
  IAnthropicTool,
  IMCPTool,
  IOpenAITool,
} from 'intellichat/types';
import { isBlank } from 'utils/validators';
import { getBase64, splitByImg, stripHtmlTags, urlJoin } from 'utils/util';
import AnthropicReader from 'intellichat/readers/AnthropicReader';
import { ITool } from 'intellichat/readers/IChatReader';
import INextChatService from './INextCharService';
import NextChatService from './NextChatService';
import Anthropic from '../../providers/Anthropic';

const debug = Debug('5ire:intellichat:AnthropicChatService');

export default class AnthropicChatService
  extends NextChatService
  implements INextChatService
{
  constructor(context: IChatContext) {
    super({
      context,
      provider: Anthropic,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  protected makeToolMessages(
    tool: ITool,
    toolResult: any,
    content?: string,
  ): IChatRequestMessage[] {
    const result = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: tool.id,
            name: tool.name,
            input: tool.args ?? {},
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: tool.id,
            content: toolResult.content,
          },
        ],
      },
    ] as IChatRequestMessage[];
    if (content) {
      (result[0].content as any[]).unshift({
        type: 'text',
        text: content,
      });
    }
    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  protected makeTool(tool: IMCPTool): IOpenAITool | IAnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: tool.inputSchema.type,
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    };
  }

  // eslint-disable-next-line class-methods-use-this
  protected getReaderType() {
    return AnthropicReader;
  }

  protected async convertPromptContent(
    content: string,
  ): Promise<string | IChatRequestMessageContent[]> {
    if (this.context.getModel().vision?.enabled) {
      const items = splitByImg(content);
      const promises = items.map(async (item) => {
        if (item.type === 'image') {
          let data = '';
          if (item.dataType === 'URL') {
            data = await getBase64(item.data);
          } else {
            [, data] = item.data.split(','); // remove data:image/png;base64,
          }
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: item.mimeType as string,
              data,
            },
          };
        }
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.data,
          };
        }
        throw new Error('Unknown message type');
      });

      const result = (await Promise.all(
        promises,
      )) as IChatRequestMessageContent[];
      return result;
    }
    return stripHtmlTags(content);
  }

  protected async makeMessages(
    messages: IChatRequestMessage[],
    msgId?:string
  ): Promise<IChatRequestMessage[]> {
    const result = this.context
      .getCtxMessages(msgId)
      .reduce((acc: IChatRequestMessage[], msg: IChatMessage) => {
        return [
          ...acc,
          {
            role: 'user',
            content: msg.prompt,
          },
          {
            role: 'assistant',
            content: msg.reply,
          },
        ] as IChatRequestMessage[];
      }, []);

    const processedMessages = (await Promise.all(
      messages.map(async (msg) => {
        if (msg.role === 'tool') {
          return {
            content: JSON.stringify(msg.content),
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
          };
        }
        if (msg.role === 'assistant' && msg.tool_calls) {
          return msg;
        }
        const { content } = msg;
        if (typeof content === 'string') {
          return {
            role: msg.role,
            content: await this.convertPromptContent(content),
          };
        }
        return {
          role: msg.role,
          content,
        };
      }),
    )) as IChatRequestMessage[];

    return [...result, ...processedMessages];
  }

  protected async makePayload(
    messages: IChatRequestMessage[],
    msgId?:string
  ): Promise<IChatRequestPayload> {
    const payload: IChatRequestPayload = {
      model: this.getModelName(),
      messages: await this.makeMessages(messages, msgId),
      temperature: this.context.getTemperature(),
      stream: true,
    };
    const systemMessage = this.context.getSystemMessage();
    if (!isBlank(systemMessage)) {
      payload.system = systemMessage as string;
    }
    if (this.context.getMaxTokens()) {
      payload.max_tokens = this.context.getMaxTokens();
    }
    if (this.context.isToolEnabled()) {
      const tools = await window.electron.mcp.listTools();
      if (tools) {
        const unusedTools = tools
          .filter((tool: any) => !this.usedToolNames.includes(tool.name))
          .map((tool: any) => {
            return this.makeTool(tool);
          });
        if (unusedTools.length > 0) {
          payload.tools = unusedTools;
          payload.tool_choice = {
            type: 'auto',
            disable_parallel_tool_use: true,
          };
        }
      }
    }
    if (this.context.getMaxTokens()) {
      payload.max_tokens = this.context.getMaxTokens();
    }
    return payload;
  }

  protected async makeRequest(
    messages: IChatRequestMessage[],
    msgId?:string
  ): Promise<Response> {
    const payload = await this.makePayload(messages, msgId);
    debug('About to make a request, payload:\r\n', payload);
    const { base, key } = this.apiSettings;
    const url = urlJoin('/messages', base);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify(payload),
      signal: this.abortController.signal,
    });
    return response;
  }
}
