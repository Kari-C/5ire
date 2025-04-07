import { IChatContext, IChatRequestMessage } from 'intellichat/types';
import { IServiceProvider } from 'providers/types';

export default interface INextChatService {
  context: IChatContext;
  provider: IServiceProvider;
  apiSettings: {
    base: string;
    key: string;
    model: string;
    secret?: string; // baidu
    deploymentId?: string; // azure
  };
  modelMapping: Record<string, string>;
  chat(message: IChatRequestMessage[], msgId?:string): void;
  abort(): void;
  isReady(): boolean;
  onComplete(callback: (result: any) => Promise<void>): void;
  onToolCalls(callback: (toolName: string) => void): void;
  onReading(callback: (chunk: string, reasoning?: string) => void): void;
  onError(callback: (error: any, aborted: boolean) => void): void;
}
