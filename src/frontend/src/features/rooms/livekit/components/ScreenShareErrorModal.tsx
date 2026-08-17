import { A, Button, Dialog, P } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

// todo - refactor it into a generic system
export const ScreenShareErrorModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'error.screenShare' })
  const isMac = navigator.userAgent.toLowerCase().indexOf('mac') !== -1

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
              {isMac && (
                <>
                  {t('macInstructions')}{' '}
                  <A
                    href="x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
                    color="primary"
                    aria-label={t('macSystemPreferences') + '-' + t('newTab')}
                  >
                    {t('macSystemPreferences')}
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
