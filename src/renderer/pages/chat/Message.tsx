/* eslint-disable jsx-a11y/anchor-has-content */
/* eslint-disable react/no-danger */
import Debug from 'debug';
import useChatStore from 'stores/useChatStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMarkdown from 'hooks/useMarkdown';
import { IChatMessage } from 'intellichat/types';
import { useTranslation } from 'react-i18next';
import { Divider } from '@fluentui/react-components';
import useKnowledgeStore from 'stores/useKnowledgeStore';
import useToast from 'hooks/useToast';
import ToolSpinner from 'renderer/components/ToolSpinner';
import useSettingsStore from 'stores/useSettingsStore';
import {
  ChevronDown16Regular,
  ChevronUp16Regular,
} from '@fluentui/react-icons';
import {
  getNormalContent,
  getReasoningContent,
  highlight,
} from '../../../utils/util';
import MessageToolbar from './MessageToolbar';
import useMermaid from '../../../hooks/useMermaid';

const debug = Debug('5ire:pages:chat:Message');

export default function Message({ message }: { message: IChatMessage }) {
  const { t } = useTranslation();
  const { notifyInfo } = useToast();
  const fontSize = useSettingsStore((state) => state.fontSize);
  const keywords = useChatStore((state: any) => state.keywords);
  const states = useChatStore().getCurState();
  const { showCitation } = useKnowledgeStore();
  const { renderMermaid } = useMermaid();
  const keyword = useMemo(
    () => keywords[message.chatId],
    [keywords, message.chatId],
  );
  const citedFiles = useMemo(
    () => JSON.parse(message.citedFiles || '[]'),
    [message.citedFiles],
  );

  const citedChunks = useMemo(() => {
    return JSON.parse(message.citedChunks || '[]');
  }, [message.citedChunks]);

  const { render } = useMarkdown();

  const onCitationClick = useCallback(
    (event: any) => {
      const url = new URL(event.target?.href);
      if (url.pathname === '/citation' || url.protocol.startsWith('file:')) {
        event.preventDefault();
        const chunkId = url.hash.replace('#', '');
        const chunk = citedChunks.find((i: any) => i.id === chunkId);
        if (chunk) {
          showCitation(chunk.content);
        } else {
          notifyInfo(t('Knowledge.Notification.CitationNotFound'));
        }
      }
    },
    [citedChunks, showCitation],
  );

  useEffect(() => {
    if (message.isActive) return; // no need to add event listener when message is active
    renderMermaid();
    const observer = new MutationObserver((mutations) => {
      const links = document.querySelectorAll(`#${message.id} .msg-reply a`);
      if (links.length > 0) {
        links.forEach((link) => {
          link.addEventListener('click', onCitationClick);
        });
      }
    });

    const targetNode = document.getElementById(message.id);
    if (targetNode) {
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer.disconnect();
      const links = document.querySelectorAll(`#${message.id} .msg-reply a`);
      links.forEach((link) => {
        link.removeEventListener('click', onCitationClick);
      });
    };
  }, [message.id, message.isActive, onCitationClick]);

  const [isReasoning, setIsReasoning] = useState(true);
  const [reasoningSeconds, setReasoningSeconds] = useState(0);
  const [isReasoningShow, setIsReasoningShow] = useState(false);
  const messageRef = useRef(message);
  const isReasoningRef = useRef(isReasoning);
  const reasoningInterval = useRef<number | null>(null);
  const reasoningRef = useRef('');
  const replyRef = useRef('');

  useEffect(() => {
    messageRef.current = message;
  }, [message.id, message.isActive]);

  useEffect(() => {
    isReasoningRef.current = isReasoning;
  }, [isReasoning]);

  const reply = useMemo(() => getNormalContent(message.reply), [message.reply]);
  const reasoning = useMemo(
    () => getReasoningContent(message.reply, message.reasoning),
    [message.reply, message.reasoning],
  );

  useEffect(() => {
    replyRef.current = reply;
    reasoningRef.current = reasoning;
  }, [reply, reasoning]);

  function monitorThinkStatus() {
    // 清除之前的计时器
    if (reasoningInterval.current) {
      clearInterval(reasoningInterval.current);
    }

    reasoningInterval.current = setInterval(() => {
      if (isReasoningRef.current && messageRef.current.isActive) {
        setReasoningSeconds((prev) => prev + 1); // 每秒增加
      }

      if (
        !!replyRef.current.trim() &&
        isReasoningRef.current &&
        messageRef.current.isActive
      ) {
        clearInterval(reasoningInterval.current as number); // 停止计时
        setIsReasoning(false);

        debug('Reasoning ended');
        debug(`Total thinking time: ${reasoningSeconds} seconds`);
      }
    }, 1000) as any;
  }

  useEffect(() => {
    if (message.isActive) {
      setIsReasoningShow(true);
      monitorThinkStatus();
    } else {
      setIsReasoning(false);
    }
    return () => {
      clearInterval(reasoningInterval.current as number);
      setReasoningSeconds(0);
    };
  }, [message.isActive]);

  const toggleThink = useCallback(() => {
    setIsReasoningShow(!isReasoningShow);
  }, [isReasoningShow]);

  const replyNode = () => {
    const isLoading = message.isActive && states.loading;
    const isEmpty =
      (!message.reply || message.reply === '') &&
      (!message.reasoning || message.reasoning === '');
    const thinkTitle = `${
      isReasoning ? t('Reasoning.Thinking') : t('Reasoning.Thought')
    }${reasoningSeconds > 0 ? ` ${reasoningSeconds}s` : ''}`;
    return (
      <div className={`w-full mt-1.5 ${isLoading ? 'is-loading' : ''}`}>
        {message.isActive && states.runningTool ? (
          <div className="flex flex-row justify-start items-center gap-1">
            <ToolSpinner size={20} style={{ marginBottom: '-1px' }} />
            <span>{states.runningTool.replace('--', ':')}</span>
          </div>
        ) : null}
        {isLoading && isEmpty ? (
          <>
            <span className="skeleton-box" style={{ width: '80%' }} />
            <span className="skeleton-box" style={{ width: '90%' }} />
          </>
        ) : (
          <div className="-mt-1">
            {reasoning.trim() ? (
              <div className="think">
                <div className="think-header" onClick={toggleThink}>
                  <span className="font-bold text-gray-400 ">{thinkTitle}</span>
                  <div className="text-gray-400 -mb-0.5">
                    {isReasoningShow ? (
                      <ChevronUp16Regular />
                    ) : (
                      <ChevronDown16Regular />
                    )}
                  </div>
                </div>
                <div
                  className="think-body"
                  style={{ display: isReasoningShow ? 'block' : 'none' }}
                >
                  <div
                    dangerouslySetInnerHTML={{
                      __html: render(
                        `${
                          highlight(reasoning, keyword) || ''
                        }${isReasoning && reasoning ? '<span class="blinking-cursor" /></span>' : ''}`,
                      ),
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div
              className={`mt-1 break-word ${
                fontSize === 'large' ? 'font-lg' : ''
              }`}
              dangerouslySetInnerHTML={{
                __html: render(
                  `${
                    highlight(reply, keyword) || ''
                  }${isLoading && reply ? '<span class="blinking-cursor" /></span>' : ''}`,
                ),
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="leading-6 message" id={message.id}>
      <div>
        <a
          id={`prompt-${message.id}`}
          aria-label={`prompt of message ${message.id}`}
        />

        <div
          className="msg-prompt my-2 flex flex-start"
          style={{ minHeight: '40px' }}
        >
          <div className="avatar flex-shrink-0 mr-2" />
          <div
            className={`mt-1 break-word ${
              fontSize === 'large' ? 'font-lg' : ''
            }`}
            dangerouslySetInnerHTML={{
              __html: render(highlight(message.prompt, keyword) || ''),
            }}
          />
        </div>
      </div>
      <div>
        <a id={`#reply-${message.id}`} aria-label={`Reply ${message.id}`} />
        <div
          className="msg-reply mt-2 flex flex-start"
          style={{ minHeight: '40px' }}
        >
          <div className="avatar flex-shrink-0 mr-2" />
          {replyNode()}
        </div>
        {citedFiles.length > 0 && (
          <div className="message-cited-files mt-2">
            <div className="mt-4 mb-2">
              <Divider>{t('Common.References')}</Divider>
            </div>
            <ul>
              {citedFiles.map((file: string) => (
                <li className="text-gray-500" key={file}>
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
        <MessageToolbar message={message} />
      </div>
    </div>
  );
}
