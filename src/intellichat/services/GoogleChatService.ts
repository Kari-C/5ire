import Debug from 'debug';
import {
  IChatContext,
  IChatRequestMessage,
  IChatRequestPayload,
  IAnthropicTool,
  IGeminiChatRequestMessagePart,
  IGoogleTool,
  IMCPTool,
  IOpenAITool,
} from 'intellichat/types';
import { isBlank } from 'utils/validators';
import Google from 'providers/Google';
import { getBase64, splitByImg, stripHtmlTags, urlJoin } from 'utils/util';
import BaseReader from 'intellichat/readers/BaseReader';
import GoogleReader from 'intellichat/readers/GoogleReader';
import { ITool } from 'intellichat/readers/IChatReader';
import NextChatService from './NextChatService';
import INextChatService from './INextCharService';

const debug = Debug('5ire:intellichat:GoogleChatService');

const containsImage = (contents: IChatRequestMessage[]): boolean => {
  if (contents?.length) {
    const prompt = contents[contents.length - 1];
    return !!prompt.parts?.some((part) => 'inline_data' in part);
  }
  return false;
};

export default class GoogleChatService
  extends NextChatService
  implements INextChatService
{
  constructor(context: IChatContext) {
    super({
      context,
      provider: Google,
    });
  }

  protected getReaderType(): new (
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ) => BaseReader {
    return GoogleReader;
  }

  protected makeToolMessages(
    tool: ITool,
    toolResult: any,
  ): IChatRequestMessage[] {
    return [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: tool.name,
              args: tool.args,
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: tool.name,
              response: {
                name: tool.name,
                content:
                  typeof toolResult === 'string'
                    ? toolResult
                    : toolResult.content,
              },
            },
          },
        ],
      },
    ];
  }

  protected makeTool(
    tool: IMCPTool,
  ): IOpenAITool | IAnthropicTool | IGoogleTool {
    if (Object.keys(tool.inputSchema.properties).length === 0) {
      return {
        name: tool.name,
        description: tool.description,
      };
    }
    const properties: any = {};
    for (const key in tool.inputSchema.properties) {
      const prop = tool.inputSchema.properties[key];
      /**
       * cause gemini-pro-vision not support additionalProperties
       */
      if (prop.items) {
        delete prop.items.additionalProperties;
      }
      properties[key] = {
        type: prop.type,
        description: prop.description,
        items: prop.items,
      };
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.inputSchema.type,
        properties,
        required: tool.inputSchema.required,
      },
    };
  }

  protected async convertPromptContent(
    content: string,
  ): Promise<IGeminiChatRequestMessagePart[]> {
    if (this.context.getModel().vision?.enabled) {
      const items = splitByImg(content, false);
      const result: IGeminiChatRequestMessagePart[] = [];
      for (const item of items) {
        if (item.type === 'image') {
          if (item.dataType === 'URL') {
            result.push({
              inline_data: {
                mimeType: item.mimeType,
                data: await getBase64(item.data),
              },
            });
          } else {
            result.push({
              inline_data: {
                mimeType: item.mimeType as string,
                data: item.data.split('base64,')[1], // remove data:image/png;base64,
              },
            });
          }
        } else if (item.type === 'text') {
          result.push({
            text: item.data,
          });
        } else {
          console.error('Unknown message type', item);
          throw new Error('Unknown message type');
        }
      }
      return result;
    }
    return Promise.resolve([{ text: stripHtmlTags(content) }]);
  }

  /**
   *
   * 由于  gemini-pro-vision  不支持多轮对话，因此如果提示词包含图片，则不包含历史信息。
   */
  protected async makeMessages(
    messages: IChatRequestMessage[],
    msgId?: string,
  ): Promise<IChatRequestMessage[]> {
    const result: IChatRequestMessage[] = [];
    const systemMessage = this.context.getSystemMessage();
    if (!isBlank(systemMessage)) {
      result.push({
        role: 'user',
        parts: [{ text: systemMessage as string }],
      });
    }
    for (const msg of this.context.getCtxMessages(msgId)) {
      result.push({
        role: 'user',
        parts: [{ text: msg.prompt }],
      });
      result.push({
        role: 'model',
        parts: [
          {
            text: msg.reply,
          },
        ],
      });
    }
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({
          role: msg.role,
          parts: await this.convertPromptContent(msg.content),
        });
      } else {
        result.push({
          role: msg.role,
          parts: msg.parts,
        });
      }
    }
    return result;
  }

  protected async makePayload(
    messages: IChatRequestMessage[],
    msgId?: string,
  ): Promise<IChatRequestPayload> {
    const payload: IChatRequestPayload = {
      contents: await this.makeMessages(messages, msgId),
      generationConfig: {
        temperature: this.context.getTemperature(),
      },
    };
    if (this.context.isToolEnabled()) {
      const tools = await window.electron.mcp.listTools();
      if (tools) {
        const _tools = tools
          .filter((tool: any) => !this.usedToolNames.includes(tool.name))
          .map((tool: any) => {
            return this.makeTool(tool);
          });
        if (_tools.length > 0) {
          payload.tools = [
            {
              function_declarations: [_tools],
            },
          ];
          payload.tool_config = { function_calling_config: { mode: 'AUTO' } };
        }
      }
    }
    const maxOutputTokens = this.context.getMaxTokens();
    if (payload.generationConfig && maxOutputTokens) {
      payload.generationConfig.maxOutputTokens = maxOutputTokens;
    }
    debug('payload', payload);
    return payload;
  }

  protected async makeRequest(
    messages: IChatRequestMessage[],
    msgId?: string,
  ): Promise<Response> {
    const payload = await this.makePayload(messages, msgId);
    const isStream = this.context.isStream();
    debug(
      `About to make a request,stream:${isStream},  payload: ${JSON.stringify(
        payload,
      )}\r\n`,
    );
    const { base, key } = this.apiSettings;
    const url = urlJoin(
      `/v1beta/models/${this.getModelName()}:${
        isStream ? 'streamGenerateContent' : 'generateContent'
      }?key=${key}`,
      base,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: this.abortController.signal,
    });
    return response;
  }
}
