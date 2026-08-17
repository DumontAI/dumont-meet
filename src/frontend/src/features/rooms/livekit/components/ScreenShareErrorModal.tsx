import { A, Button, Dialog, P } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { getOS, type OS } from '@/utils/os'

const SCREEN_CAPTURE_SETTINGS_LINKS: Partial<Record<OS, string>> = {
  macos:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  windows: 'ms-settings:privacy-graphicscaptureprogrammatic',
}

// todo - refactor it into a generic system
export const ScreenShareErrorModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'error.screenShare' })
  const os = getOS()
  const settingsHref = SCREEN_CAPTURE_SETTINGS_LINKS[os]

  return (
    <Dialog
      isOpen={isOpen}
      role="alertdialog"
      title={t('title')}
      aria-label={t('ariaLabel')}
      onClose={onClose}
    >
      {({ close }) => {
        return (
          <>
            <P>
              {t('message')}{' '}
              {settingsHref && (
                <>
                  {t('settingsInstructions')}{' '}
                  <A
                    href={settingsHref}
                    target="_blank"
                    color="primary"
                    aria-label={t(`settingsLabel.${os}`) + '-' + t('newTab')}
                  >
                    {t(`settingsLabel.${os}`)}
                  </A>
                  .{' '}
                </>
              )}
              {/* Upstream follows the macOS instructions with "for more
                  information, see ..." pointing at lasuite.crisp.help, DINUM's
                  French-language Crisp desk. That was the last user-visible La
                  Suite URL in the app and there is no Dumont equivalent to
                  swap in. Dropped rather than replaced: the System Preferences
                  deep link above is the actual fix, so the sentence was only
                  sending people somewhere worse. The helpLinkText and
                  helpLinkLabel locale strings are left in place -- inert, and
                  cheaper than a four-locale diff at every upstream rebase. */}
            </P>
            <Button
              onPress={close}
              size="sm"
              variant="primary"
              className={css({ marginLeft: 'auto', marginTop: '2rem' })}
            >
              {t('closeButton')}
            </Button>
          </>
        )
      }}
    </Dialog>
  )
}
