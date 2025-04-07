import {
  Button,
  Text,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Tooltip,
} from '@fluentui/react-components';
import {
  bundleIcon,
  Delete16Filled,
  Delete16Regular,
  Bookmark16Filled,
  Bookmark16Regular,
  Copy16Regular,
  Copy16Filled,
  ArrowSync16Filled,
  ArrowSync16Regular,
} from '@fluentui/react-icons';
import eventBus from 'utils/bus';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useBookmarkStore from 'stores/useBookmarkStore';
import useChatStore from 'stores/useChatStore';
import { IBookmark } from 'types/bookmark';
import { fmtDateTime, unix2date } from 'utils/util';
import useToast from 'hooks/useToast';
import { IChatMessage } from 'intellichat/types';

const DeleteIcon = bundleIcon(Delete16Filled, Delete16Regular);
const CopyIcon = bundleIcon(Copy16Filled, Copy16Regular);
const BookmarkAddIcon = bundleIcon(Bookmark16Filled, Bookmark16Regular);
const BookmarkOffIcon = bundleIcon(Bookmark16Regular, Bookmark16Filled);
const ArrowSync = bundleIcon(ArrowSync16Filled, ArrowSync16Regular);

export default function MessageToolbar({ message }: { message: IChatMessage }) {
  const { t } = useTranslation();
  const [delPopoverOpen, setDelPopoverOpen] = useState<boolean>(false);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const bookmarkMessage = useChatStore((state) => state.bookmarkMessage);
  const createBookmark = useBookmarkStore((state) => state.createBookmark);
  const deleteBookmark = useBookmarkStore((state) => state.deleteBookmark);
  const { notifySuccess } = useToast();
  const bus = useRef(eventBus);

  const bookmark = async () => {
    const bookmark = await createBookmark({
      msgId: message.id,
      prompt: message.prompt,
      reply: message.reply,
      reasoning: message.reasoning || '',
      model: message.model,
      temperature: message.temperature,
      citedFiles: message.citedFiles,
      citedChunks: message.citedChunks,
      memo: message.memo,
    } as IBookmark);
    notifySuccess(t('Bookmarks.Notification.Added'));
    bookmarkMessage(message.id, bookmark.id);
    window.electron.ingestEvent([{ app: 'bookmark' }]);
  };

  const unbookmark = async () => {
    if (message.bookmarkId) {
      await deleteBookmark(message.bookmarkId);
      notifySuccess(t('Bookmarks.Notification.Removed'));
      bookmarkMessage(message.id, null);
      window.electron.ingestEvent([{ app: 'unbookmark' }]);
    }
  };

  const copy = () => {
    const content = `user: \n${message.prompt}\n\nassistant:\n${message.reply}`;
    navigator.clipboard.writeText(content);
    notifySuccess(t('Common.Notification.Copied'));
  };


  return (
    !message.isActive && (
      <div className="message-toolbar p-0.5 rounded-md flex justify-between items-center">
        <div className="flex justify-start items-center gap-3">
          {message.bookmarkId ? (
            <Tooltip content={t('Common.Action.Bookmark')} relationship="label">
              <Button
                size="small"
                icon={<BookmarkOffIcon />}
                appearance="subtle"
                onClick={() => unbookmark()}
              />
            </Tooltip>
          ) : (
            <Tooltip content={t('Common.Action.Bookmark')} relationship="label">
              <Button
                size="small"
                icon={<BookmarkAddIcon />}
                appearance="subtle"
                onClick={() => bookmark()}
              />
            </Tooltip>
          )}
          <Button
            size="small"
            icon={<CopyIcon />}
            appearance="subtle"
            onClick={copy}
          />
          <Button
            size="small"
            icon={<ArrowSync />}
            appearance="subtle"
            onClick={() => {
              bus.current.emit('retry', {
                msgId: message.id,
                prompt: message.prompt,
              });
            }}
          />
          <Popover withArrow open={delPopoverOpen}>
            <PopoverTrigger disableButtonEnhancement>
              <Button
                size="small"
                icon={<DeleteIcon />}
                appearance="subtle"
                onClick={() => setDelPopoverOpen(true)}
              />
            </PopoverTrigger>
            <PopoverSurface>
              <div>
                <div className="p-2 mb-2 text-center">
                  {t('Common.DeleteConfirmation')}
                </div>
                <div className="flex justify-evenly gap-5 items-center">
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={() => setDelPopoverOpen(false)}
                  >
                    {t('Common.Cancel')}
                  </Button>
                  <Button
                    size="small"
                    appearance="primary"
                    onClick={() => {
                      deleteMessage(message.id);
                      setDelPopoverOpen(false);
                      notifySuccess(t('Message.Notification.Deleted'));
                    }}
                  >
                    {t('Common.Yes')}
                  </Button>
                </div>
              </div>
            </PopoverSurface>
          </Popover>
        </div>
        <div className="mr-2.5">
          <div className="flex justify-start items-center gap-5">
            <Text size={200}>
              <span className="latin hidden sm:block">
                {(message.inputTokens || 0) + (message.outputTokens || 0)}{' '}
                tokens
              </span>
            </Text>
            <Text size={200}>
              <span className="latin">{message.model}</span>
            </Text>
            <Text size={200} truncate>
              <span className="latin">
                {fmtDateTime(unix2date(message.createdAt))}
              </span>
            </Text>
          </div>
        </div>
      </div>
    )
  );
}
