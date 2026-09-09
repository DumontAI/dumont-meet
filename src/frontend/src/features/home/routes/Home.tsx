import { useTranslation } from 'react-i18next'
import { DialogTrigger } from 'react-aria-components'
import { Button } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import { Screen } from '@/layout/Screen'
import { UserAware } from '@/features/auth/components/UserAware'
import { useUser } from '@/features/auth/api/useUser'
import { JoinMeetingDialog } from '../components/JoinMeetingDialog'
import { IntroSlider } from '../components/IntroSlider'
import { HomePanel } from '../components/HomePanel'
import { MoreLink } from '../components/MoreLink'
import { CreateMeetingMenu } from '../components/CreateMeetingMenu'
import { ReactNode, useEffect, useState } from 'react'

import { css } from '@/styled-system/css'
import { useConfig } from '@/api/useConfig'
import { LoginButton } from '@/components/LoginButton'
import { LoadingScreen } from '@/components/LoadingScreen'
import { captureEvent } from '@/features/analytics/telemetry'

// The marketing layout lets both columns spread across the whole viewport,
// which suits a full-bleed illustration. The signed-in panel is a bounded card,
// so the same rule leaves a void between the two columns on a wide screen.
// `signedIn` caps the row and pulls the columns back together.
const Columns = ({
  children,
  signedIn = false,
}: {
  children?: ReactNode
  signedIn?: boolean
}) => {
  return (
    <div
      className={css(
        {
          alignItems: 'center',
          margin: 'auto',
          display: 'inline-flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: '100%',
          justifyContent: 'normal',
          padding: '0 1rem',
          width: 'calc(100% - 2rem)',
          _motionReduce: {
            opacity: 1,
          },
          _motionSafe: {
            opacity: 0,
            animation: '.5s ease-in fade 0s forwards',
          },
          lg: {
            flexDirection: 'row',
            justifyContent: 'center',
            width: '100%',
            padding: 0,
          },
        },
        signedIn && { lg: { maxWidth: '78rem' } }
      )}
    >
      {children}
    </div>
  )
}

const LeftColumn = ({
  children,
  signedIn = false,
}: {
  children?: ReactNode
  signedIn?: boolean
}) => {
  return (
    <div
      className={css(
        {
          alignItems: 'center',
          textAlign: 'center',
          display: 'inline-flex',
          flexDirection: 'column',
          flexBasis: 'auto',
          flexShrink: 0,
          maxWidth: '38rem',
          width: '100%',
          padding: '1rem 3%',
          marginTop: 'auto',
          lg: {
            margin: 0,
            textAlign: 'left',
            alignItems: 'flex-start',
            flexShrink: '1',
            flexBasis: '40rem',
            maxWidth: '40rem',
            padding: '1em 3em',
          },
          // Below lg the row becomes a column, where flexBasis sets a HEIGHT floor
          // rather than a width, so the narrowing has to stay inside the lg block.
          // marginTop:auto pushes this column to the bottom of the full-height
          // stack, which centres a lone marketing block but with a panel stacked
          // underneath it strands the panel far below the buttons.
        },
        signedIn && {
          marginTop: 0,
          lg: { flexBasis: '34rem', maxWidth: '34rem' },
        }
      )}
    >
      {children}
    </div>
  )
}

const RightColumn = ({
  children,
  signedIn = false,
}: {
  children?: ReactNode
  signedIn?: boolean
}) => {
  return (
    <div
      className={css(
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflow: 'hidden',
          padding: '1rem 3%',
          marginBottom: 'auto',
          flexBasis: 'auto',
          flexShrink: 0,
          maxWidth: '39rem',
          lg: {
            margin: 0,
            flexBasis: '45%',
            padding: '1em 3em',
          },
        },
        signedIn && {
          marginBottom: 0,
          lg: { flexBasis: '34rem', maxWidth: '34rem' },
        }
      )}
    >
      {children}
    </div>
  )
}

const Separator = styled('div', {
  base: {
    borderBottom: '1px solid',
    borderColor: 'greyscale.500',
    marginTop: '2.5rem',
    maxWidth: '30rem',
    width: '100%',
  },
})

const Heading = styled('h1', {
  base: {
    fontWeight: '700',
    fontStyle: 'normal',
    fontStretch: 'normal',
    fontOpticalSizing: 'auto',
    paddingBottom: '1.2rem',
    fontSize: '2.3rem',
    lineHeight: '2.6rem',
    letterSpacing: '0',
    xsm: {
      fontSize: '3rem',
      lineHeight: '3.2rem',
    },
  },
})

const IntroText = styled('div', {
  base: {
    marginBottom: '3rem',
    fontSize: '1.2rem',
    lineHeight: '1.5rem',
    textWrap: 'balance',
    maxWidth: '32rem',
  },
})

const getGreetingPeriod = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

const Home = () => {
  const { t } = useTranslation('home')
  const { isLoggedIn, user } = useUser()

  // `full_name` is often empty on this deployment, so the nameless greeting is
  // the common path, not an edge case.
  const firstName = user?.full_name?.trim().split(/\s+/)[0]
  const greeting = t(
    `greeting.${getGreetingPeriod()}${firstName ? 'Named' : ''}`,
    { name: firstName }
  )

  const [redirectFailed, setRedirectFailed] = useState(false)
  const { data } = useConfig()

  useEffect(() => {
    const checkSiteAndRedirect = async () => {
      if (!data?.external_home_url) return
      if (isLoggedIn === false) {
        try {
          await fetch(data.external_home_url, {
            method: 'HEAD', // Use HEAD to avoid downloading the full page
            mode: 'no-cors', // Needed for cross-origin requests
          })
          window.location.replace(data.external_home_url)
        } catch (error) {
          setRedirectFailed(true)
          captureEvent('external-home-unreachable', {
            error_name: error instanceof Error ? error.name : 'Unknown',
            error_message:
              error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    checkSiteAndRedirect()
  }, [isLoggedIn, data])

  if (data?.external_home_url && isLoggedIn == false && !redirectFailed) {
    return <LoadingScreen header={false} footer={false} delay={0} />
  }

  return (
    <UserAware>
      <Screen>
        <Columns signedIn={!!isLoggedIn}>
          <LeftColumn signedIn={!!isLoggedIn}>
            <Heading>{isLoggedIn ? greeting : t('heading')}</Heading>
            <IntroText>
              {isLoggedIn ? t('signedInIntro') : t('intro')}
            </IntroText>
            <div
              className={css({
                display: 'flex',
                gap: 0.5,
                flexDirection: { base: 'column', xsm: 'row' },
                alignItems: { base: 'center', xsm: 'items-start' },
              })}
            >
              {isLoggedIn ? (
                <CreateMeetingMenu />
              ) : (
                <LoginButton proConnectHint={false} />
              )}
              <DialogTrigger>
                <Button
                  variant="secondary"
                  style={{
                    height:
                      !isLoggedIn && data?.use_proconnect_button
                        ? '56px'
                        : undefined, // Temporary, Align with ProConnect Button fixed height
                  }}
                >
                  {t('joinMeeting')}
                </Button>
                <JoinMeetingDialog />
              </DialogTrigger>
            </div>
            <Separator />
            <MoreLink />
          </LeftColumn>
          <RightColumn signedIn={!!isLoggedIn}>
            {isLoggedIn ? <HomePanel /> : <IntroSlider />}
          </RightColumn>
        </Columns>
      </Screen>
    </UserAware>
  )
}

export default Home
