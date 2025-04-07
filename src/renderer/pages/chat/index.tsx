import Debug from 'debug';
import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tempChatId } from 'consts';
import useToast from 'hooks/useToast';
import useChatService from 'hooks/useChatService';
import useToken from 'hooks/useToken';

import { IChat, IChatMessage, IChatResponseMessage } from 'intellichat/types';
import INextChatService from 'intellichat/services/INextCharService';
import { ICollectionFile } from 'types/knowledge';

import useChatStore from 'stores/useChatStore';
import useChatKnowledgeStore from 'stores/useChatKnowledgeStore';
import useKnowledgeStore from 'stores/useKnowledgeStore';
import useSettingsStore from 'stores/useSettingsStore';
import useInspectorStore from 'stores/useInspectorStore';

import SplitPane, { Pane } from 'split-pane-react';
import Empty from 'renderer/components/Empty';

import useUsageStore from 'stores/useUsageStore';
import useNav from 'hooks/useNav';
import { debounce } from 'lodash';
import { isBlank } from 'utils/validators';
import {
  extractCitationIds,
  getNormalContent,
  getReasoningContent,
} from 'utils/util';
import Header from './Header';
import Messages from './Messages';
import Editor from './Editor';
import Sidebar from './Sidebar/Sidebar';
import CitationDialog from './CitationDialog';

import './Chat.scss';
import 'split-pane-react/esm/themes/default.css';
import eventBus, { RetryEvent } from 'utils/bus';

const debug = Debug('5ire:pages:chat');

const MemoizedMessages = React.memo(Messages);

export default function Chat() {
  const { t } = useTranslation();
  const id = useParams().id || tempChatId;
  const anchor = useParams().anchor || null;
  const bus = useRef(eventBus);
  const [activeChatId, setActiveChatId] = useState(id);
  if (activeChatId !== id) {
    setActiveChatId(id);
    debug('Set chat id:', id);
  }
  const [sizes, setSizes] = useState(['auto', 200]);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNav();
  const folder = useChatStore((state) => state.folder);
  const keywords = useChatStore((state) => state.keywords);
  const messages = useChatStore((state) => state.messages);
  const setKeyword = useChatStore((state) => state.setKeyword);
  const tempStage = useChatStore((state) => state.tempStage);
  const {
    fetchMessages,
    initChat,
    getChat,
    updateChat,
    updateStates,
    getCurFolderSettings,
    openFolder,
  } = useChatStore();
  const clearTrace = useInspectorStore((state) => state.clearTrace);
  const modelMapping = useSettingsStore((state) => state.modelMapping);
  const chatService = useRef<INextChatService>(useChatService());

  const { notifyError } = useToast();

  const isUserScrollingRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  const scrollToBottom = useRef(
    debounce(
      () => {
        if (ref.current) {
          ref.current.scrollTop = ref.current.scrollHeight;
        }
      },
      100,
      { leading: true, maxWait: 300 },
    ),
  ).current;

  // 监听滚动事件
  const handleScroll = useRef(
    debounce(
      () => {
        if (ref.current) {
          const { scrollTop, scrollHeight, clientHeight } = ref.current;
          const atBottom = scrollTop + clientHeight >= scrollHeight - 50;
          if (scrollTop > lastScrollTopRef.current) {
            if (atBottom) {
              isUserScrollingRef.current = false;
            }
          } else {
            isUserScrollingRef.current = true;
            scrollToBottom.cancel();
          }
          lastScrollTopRef.current = scrollTop;
        }
      },
      300,
      { leading: true, maxWait: 500 },
    ),
  ).current;

  useEffect(() => {
    const currentRef = ref.current;
    currentRef?.addEventListener('scroll', handleScroll);
    return () => {
      currentRef?.removeEventListener('scroll', handleScroll);
      isUserScrollingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeChatId !== tempChatId) {
      getChat(activeChatId);
    } else if (chatService.current?.isReady()) {
      if (folder) {
        initChat(getCurFolderSettings());
      } else {
        initChat(tempStage);
      }
    }
    return () => {
      isUserScrollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  const debouncedFetchMessages = useMemo(
    () =>
      debounce(
        async (chatId: string, keyword: string) => {
          await fetchMessages({ chatId, keyword });
          debug('Fetch chat messages, chatId:', chatId, ', keyword:', keyword);
        },
        400,
        {
          leading: true,
          maxWait: 2000,
        },
      ),
    [fetchMessages],
  );

  useEffect(() => {
    const loadMessages = async () => {
      const keyword = keywords[activeChatId] || '';
      await debouncedFetchMessages(activeChatId, keyword);
      if (anchor) {
        const anchorDom = document.getElementById(anchor);
        anchorDom?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        scrollToBottom();
      }
    };
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, debouncedFetchMessages, keywords]);

  useEffect(() => {
    bus.current.on('retry', async (event: any) => {
      await onSubmit(event.prompt, event.msgId);
    });
    return () => {
      bus.current.off('retry');
    };
  }, [messages]);

  const sashRender = () => <div className="border-t border-base" />;

  const { createMessage, createChat, deleteStage, updateMessage, appendReply } =
    useChatStore();

  const { countInput, countOutput } = useToken();

  const { moveChatCollections, listChatCollections, setChatCollections } =
    useChatKnowledgeStore.getState();

  const onSubmit = useCallback(
    async (prompt: string, msgId?: string) => {
      if (prompt.trim() === '') {
        return;
      }
      const model = chatService.current.context.getModel();
      let $chatId = activeChatId;
      if (activeChatId === tempChatId) {
        const $chat = await createChat(
          {
            summary: prompt.substring(0, 50),
            folderId: folder?.id || null,
          },
          async (newChat: IChat) => {
            const knowledgeCollections = moveChatCollections(
              tempChatId,
              newChat.id,
            );
            await setChatCollections(newChat.id, knowledgeCollections);
          },
        );
        $chatId = $chat.id;
        setActiveChatId($chatId);
        navigate(`/chats/${$chatId}`);
        if (folder) {
          openFolder(folder.id);
        }
        deleteStage(tempChatId);
      } else {
        if (!msgId) {
          await updateChat({
            id: activeChatId,
            summary: prompt.substring(0, 50),
          });
        }
        setKeyword(activeChatId, ''); // clear filter keyword
      }
      clearTrace($chatId);
      updateStates($chatId, { loading: true });
      const msg = msgId
        ? (messages.find((message) => msgId === message.id) as IChatMessage)
        : await useChatStore.getState().createMessage({
            prompt,
            reply: '',
            chatId: $chatId,
            model: modelMapping[model.label || ''] || model.label,
            temperature: chatService.current.context.getTemperature(),
            maxTokens: chatService.current.context.getMaxTokens(),
            isActive: 1,
          });

      if (msgId) {
        await updateMessage({
          id: msgId,
          reply: '',
          reasoning: '',
          model: modelMapping[model.label || ''] || model.label,
          temperature: chatService.current.context.getTemperature(),
          maxTokens: chatService.current.context.getMaxTokens(),
          isActive: 1,
          citedFiles: '[]',
          citedChunks: '[]',
        });
      } else {
        scrollToBottom();
      }

      // Knowledge Collections
      let knowledgeChunks = [];
      let files: ICollectionFile[] = [];
      let actualPrompt = prompt;
      const chatCollections = await listChatCollections($chatId);
      if (chatCollections.length) {
        const knowledgeString = await window.electron.knowledge.search(
          chatCollections.map((c) => c.id),
          prompt,
        );
        knowledgeChunks = JSON.parse(knowledgeString);
        useKnowledgeStore.getState().cacheChunks(knowledgeChunks);
        const filesId = [
          ...new Set<string>(knowledgeChunks.map((k: any) => k.fileId)),
        ];
        files = await useKnowledgeStore.getState().getFiles(filesId);
        actualPrompt = `
# Context #
Please read carefully and use the following context information in JSON format to answer questions.
The context format is {"seqNo": number, "id": "id", "file":"fileName", "content": "content"}.
When using context information in your response, output the reference as \`[(<seqNo>)](citation#<id> '<file>')\` strictly after the relevant content.
---------------------------------------------------
For example:
the context information is: {"seqNo": 1, "id": "432939KFD83242", "file":"Fruit Encyclopedia", "content": "apples are one of common fruit"}.
and the question is: "What are some common fruits?".
The answer should be:
"According to the information provided, apples are a common fruit [(1)](citation#432939KFD83242 'Fruit Encyclopedia')."
---------------------------------------------------
Ensure that the context information is accurately referenced, and label it as [(<seqNo>)](citation#<id> '<file>') when a piece of information is actually used.
${JSON.stringify(
  knowledgeChunks.map((k: any, idx: number) => ({
    seqNo: idx + 1,
    file: files.find((f) => f.id === k.fileId)?.name,
    id: k.id,
    content: k.content,
  })),
)}

# Objective #
${prompt}
`;
      }

      const onChatComplete = async (result: IChatResponseMessage) => {
        /**
         * 异常分两种情况，一种是有输出， 但没有正常结束； 一种是没有输出
         * 异常且没有输出，则只更新 isActive 为 0
         */
        if (
          result.error &&
          isBlank(result.content) &&
          isBlank(result.reasoning)
        ) {
          await updateMessage({
            id: msg.id,
            isActive: 0,
          });
        } else {
          const inputTokens = result.inputTokens || (await countInput(prompt));
          const outputTokens =
            result.outputTokens || (await countOutput(result.content || ''));
          const citedChunkIds = extractCitationIds(result.content || '');
          const citedChunks = knowledgeChunks.filter((k: any) =>
            citedChunkIds.includes(k.id),
          );
          const citedFileIds = [
            ...new Set(citedChunks.map((k: any) => k.fileId)),
          ];
          const citedFiles = files.filter((f) => citedFileIds.includes(f.id));
          await updateMessage({
            id: msg.id,
            reply: getNormalContent(result.content as string),
            reasoning: getReasoningContent(
              result.content as string,
              result.reasoning,
            ),
            inputTokens,
            outputTokens,
            isActive: 0,
            citedFiles: JSON.stringify(citedFiles.map((f) => f.name)),
            citedChunks: JSON.stringify(
              citedChunks.map((k: any, idx: number) => ({
                seqNo: idx + 1,
                content: k.content,
                id: k.id,
              })),
            ),
          });
          useUsageStore.getState().create({
            provider: chatService.current.provider.name,
            model: modelMapping[model.label || ''] || model.label,
            inputTokens,
            outputTokens,
          });
        }
        updateStates($chatId, { loading: false, runningTool: null });
      };
      chatService.current.onComplete(onChatComplete);
      chatService.current.onReading((content: string, reasoning?: string) => {
        appendReply(msg.id, content || '', reasoning || '');
        if (!isUserScrollingRef.current) {
          scrollToBottom();
        }
      });
      chatService.current.onToolCalls((toolName: string) => {
        updateStates($chatId, { runningTool: toolName });
      });
      chatService.current.onError((err: any, aborted: boolean) => {
        console.error(err);
        if (!aborted) {
          notifyError(err.message || err);
        }
        updateStates($chatId, { loading: false });
      });

      await chatService.current.chat(
        [
          {
            role: 'user',
            content: actualPrompt,
          },
        ],
        msgId,
      );
      window.electron.ingestEvent([{ app: 'chat' }, { model: model.label }]);
    },
    [
      activeChatId,
      messages,
      createMessage,
      scrollToBottom,
      createChat,
      updateChat,
      setKeyword,
      countInput,
      countOutput,
      updateMessage,
      navigate,
      appendReply,
      notifyError,
    ],
  );

  return (
    <div id="chat" className="relative h-screen flex flex-start">
      <div className="flex-grow relative">
        <Header />
        <div className="h-screen -mx-5 mt-10">
          <SplitPane
            split="horizontal"
            sizes={sizes}
            onChange={setSizes}
            performanceMode
            sashRender={sashRender}
          >
            <Pane className="chat-content flex-grow">
              <div id="messages" ref={ref} className="overflow-y-auto h-full">
                {messages.length ? (
                  <div className="mx-auto max-w-screen-md px-5">
                    <MemoizedMessages messages={messages} />
                  </div>
                ) : (
                  chatService.current.isReady() || (
                    <Empty image="hint" text={t('Notification.APINotReady')} />
                  )
                )}
              </div>
            </Pane>
            <Pane minSize={180} maxSize="60%">
              {chatService.current.isReady() ? (
                <Editor
                  onSubmit={onSubmit}
                  onAbort={() => {
                    chatService.current.abort();
                  }}
                />
              ) : (
                <div className="flex flex-col justify-center h-3/4 text-center text-sm text-gray-400">
                  {id === tempChatId ? '' : t('Notification.APINotReady')}
                </div>
              )}
            </Pane>
          </SplitPane>
        </div>
      </div>
      <Sidebar chatId={activeChatId} />
      <CitationDialog />
    </div>
  );
}
