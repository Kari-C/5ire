import {
  Avatar,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MenuDivider,
  MenuProps,
  Button,
  Persona,
} from '@fluentui/react-components';
import Mousetrap from 'mousetrap';
import {
  bundleIcon,
  DataUsage24Regular,
  Fire24Regular,
  Fire24Filled,
  ReceiptSparkles24Regular,
  Settings24Regular,
  SignOut24Regular,
} from '@fluentui/react-icons';
import { useTranslation } from 'react-i18next';
import useAppearanceStore from 'stores/useAppearanceStore';
import useNav from 'hooks/useNav';
import { useEffect, useState } from 'react';
import useToast from 'hooks/useToast';
import useAuthStore from 'stores/useAuthStore';

// const debug = Debug('5ire:components:layout:aside:WorkspaceMenu');

const FireIcon = bundleIcon(Fire24Filled, Fire24Regular);

export default function WorkspaceMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const navigate = useNav();
  const { notifySuccess, notifyError } = useToast();
  const theme = useAppearanceStore((state) => state.theme);
  const user = useAuthStore((state) => state.user);

  const navToProfile = () => {
    if (!user) {
      navigate('/user/login');
    } else {
      navigate('/user/account');
    }
    setOpen(false);
  };

  const signOut = async () => {
    const { error } = await useAuthStore.getState().signOut();
    if (error) {
      notifyError(error.message);
    } else {
      notifySuccess(t('Notification.SignOutSuccess'));
      navigate('/user/login');
    }
  };

  const onOpenChange: MenuProps['onOpenChange'] = (e, data) => {
    setOpen(data.open);
  };

  useEffect(() => {
    Mousetrap.bind('mod+,', () => navigate('/settings'));
    Mousetrap.bind('mod+p', () => navigate('/prompts'));
    return () => {
      Mousetrap.unbind('mod+k');
      Mousetrap.unbind('mod+p');
    };
  }, []);

  return (
    <div className="pr-0.5">
      <Menu open={open} onOpenChange={onOpenChange}>
        <div
          className={`${collapsed ? '' : 'flex items-center justify-between '}`}
        >
          <MenuTrigger disableButtonEnhancement>
            <MenuButton
              icon={<FireIcon />}
              appearance="subtle"
              style={{ borderColor: 'transparent', boxShadow: 'none' }}
              className="w-full justify-start outline-none"
              onClick={() => setOpen(true)}
            >
              {collapsed ? null : t('Common.Workspace')}
            </MenuButton>
          </MenuTrigger>
          {collapsed ||
            (user && (
              <Button
                className="ml-5"
                onClick={() => navigate('/user/account')}
                appearance="subtle"
                icon={
                  <Avatar
                    aria-label={t('Common.User')}
                    name={user.user_metadata.name}
                    color="colorful"
                    size={24}
                  />
                }
              />
            ))}
        </div>
        <MenuPopover
          className="w-full"
          style={{ width: '254px' }}
          data-theme={theme}
        >
          <Button
            onClick={navToProfile}
            appearance="subtle"
            className="w-full justify-start"
          >
            <div className="px-0 py-1.5">
              {user ? (
                <div className="flex justify-start flex-nowrap items-center">
                  <Persona
                    size="large"
                    name={user.user_metadata.name}
                    secondaryText={user.email}
                    avatar={
                      <Avatar
                        aria-label={t('Common.User')}
                        name={user.user_metadata.name}
                        color="colorful"
                        className="mr-2"
                        shape="square"
                        size={40}
                      />
                    }
                  />
                </div>
              ) : (
                <div className="flex justify-start flex-nowrap items-center">
                  <Avatar
                    aria-label={t('Common.Guest')}
                    className="mr-2"
                    shape="square"
                    size={40}
                  />
                  <span>{t('Common.SignIn')}</span>
                </div>
              )}
            </div>
          </Button>
          <MenuList>
            <MenuDivider className="border-base" />
            <MenuItem
              title="mod+k"
              icon={<Settings24Regular />}
              onClick={() => {
                navigate('/settings');
              }}
            >
              {t('Common.Settings')}
            </MenuItem>
            <MenuItem
              icon={<ReceiptSparkles24Regular />}
              onClick={() => {
                navigate('/prompts');
              }}
            >
              {t('Common.Prompts')}
            </MenuItem>
            <MenuItem
              icon={<DataUsage24Regular />}
              onClick={() => {
                navigate('/usage');
              }}
            >
              {t('Common.Analytics')}
            </MenuItem>
            {user ? (
              <div>
                <MenuDivider />
                <MenuItem icon={<SignOut24Regular />} onClick={signOut}>
                  {t('Common.SignOut')}
                </MenuItem>
              </div>
            ) : null}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}
