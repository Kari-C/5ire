import {
  IAnthropicTool,
  IGeminiChatRequestMessagePart,
  IGoogleTool,
  IMCPTool,
  IOpenAITool,
} from '../types';
import Debug from 'debug';
import {
  IChatContext,
  IChatRequestMessage,
  IChatRequestPayload,
} from 'intellichat/types';
import { isBlank } from 'utils/validators';
import Google from 'providers/Google';
import { getBase64, splitByImg, stripHtmlTags } from 'utils/util';
import INextChatService from './INextCharService';
import NextChatService from './NextChatService';
import BaseReader from 'intellichat/readers/BaseReader';
import GoogleReader from 'intellichat/readers/GoogleReader';
import { ITool } from 'intellichat/readers/IChatReader';

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
    reader: ReadableStreamDefaultReader<Uint8Array>
  ) => BaseReader {
    return GoogleReader;
  }

  protected makeToolMessages(
    tool: ITool,
    toolResult: any
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
                content: toolResult.content,
              },
            },
          },
        ],
      },
    ];
  }

  protected makeTool(
    tool: IMCPTool
  ): IOpenAITool | IAnthropicTool | IGoogleTool {
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.inputSchema.type,
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required,
      },
    };
  }

  protected async convertPromptContent(
    content: string
  ): Promise<IGeminiChatRequestMessagePart[]> {
    if (this.context.getModel().vision?.enabled) {
      const items = splitByImg(content, false);
      const result: IGeminiChatRequestMessagePart[] = [];
      for (let item of items) {
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
    messages: IChatRequestMessage[]
  ): Promise<IChatRequestMessage[]> {
    let result: IChatRequestMessage[] = [];
    const systemMessage = this.context.getSystemMessage();
    if (!isBlank(systemMessage)) {
      result.push({
        role: 'user',
        parts: [{ text: systemMessage as string }],
      });
    }
    for (let msg of this.context.getCtxMessages()) {
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
      result.push({
        role: msg.role,
        parts: msg.content
          ? await this.convertPromptContent(msg.content as string)
          : msg.parts,
      });
    }
    return result;
  }

  protected async makePayload(
    messages: IChatRequestMessage[]
  ): Promise<IChatRequestPayload> {
    const payload: IChatRequestPayload = {
      contents: await this.makeMessages(messages),
      generationConfig: {
        temperature: this.context.getTemperature(),
      },
    };
    const model = this.context.getModel();
    if (model.toolEnabled) {
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
          payload.tool_config = { function_calling_config:{mode: 'AUTO' }};
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
    messages: IChatRequestMessage[]
  ): Promise<Response> {
    const payload = await this.makePayload(messages);
    const isStream = this.context.isStream();
    debug(
      `About to make a request,stream:${isStream},  payload: ${JSON.stringify(
        payload
      )}\r\n`
    );
    const { base, key } = this.apiSettings;
    /**
     * 特殊处理，因为如果选用vision模型，但内容中没有图片会出现异常
     * 所以如果选用 vision 模型，但没有提供图片内容，则调用 gemini-pro
     */
    const model = this.context.getModel().name;
    const response = await fetch(
      `${base}/v1beta/models/${model}:${
        isStream ? 'streamGenerateContent' : 'generateContent'
      }?key=${key}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      }
    );
    return response;
  }
}
