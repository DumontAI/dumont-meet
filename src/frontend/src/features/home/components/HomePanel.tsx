import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as WouterLink } from 'wouter'
import {
  RiCheckLine,
  RiCloseLine,
  RiFileCopyLine,
  RiPencilLine,
  RiVideoChatLine,
} from '@remixicon/react'
import { css } from '@/styled-system/css'
import { Button, Input, Text } from '@/primitives'
import { getRoutePath } from '@/navigation/getRoutePath'
import { type ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useListMyRooms, useRenameRoom } from '@/features/rooms/api/listRooms'
import { useCopyRoomToClipboard } from '@/features/rooms/livekit/hooks/useCopyRoomToClipboard'

const MAX_ITEMS = 5

const listStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
  listStyle: 'none',
  margin: 0,
  padding: 0,
})

const rowStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  borderRadius: 8,
  minWidth: 0,
  '&:hover': {
    backgroundColor: 'greyscale.50',
  },
})

const rowLinkStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.625rem',
  flex: 1,
  minWidth: 0,
  padding: '0.5rem 0.625rem',
  borderRadius: 8,
  color: 'greyscale.1000',
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': {
    textDecoration: 'underline',
  },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'focusRing',
    outlineOffset: '-2px',
  },
})

const rowIconStyle = css({
  flexShrink: 0,
  color: 'greyscale.500',
})

const rowTitleStyle = css({
  fontSize: '0.9375rem',
  fontWeight: '500',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const editRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  flex: 1,
  minWidth: 0,
  padding: '0.25rem 0.25rem 0.25rem 0.625rem',
})

const Panel = ({ children }: { children?: ReactNode }) => (
  <div
    className={css({
      width: '100%',
      // The right column is shrink-to-fit outside of large viewports, so cap
      // the panel against the viewport to keep it from overflowing on mobile.
      maxWidth: 'min(32rem, calc(100vw - 4rem))',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      backgroundColor: 'box.bg',
      border: '1px solid',
      borderColor: 'greyscale.200',
      borderRadius: 16,
      boxShadow: 'box',
      padding: '1.5rem',
    })}
  >
    {children}
  </div>
)

const Section = ({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children?: ReactNode
}) => (
  <section
    className={css({
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      minWidth: 0,
    })}
  >
    <h2
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.8125rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'greyscale.600',
        margin: 0,
      })}
    >
      {icon}
      {title}
    </h2>
    {children}
  </section>
)

const SectionLoading = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} className={listStyle}>
    {[0, 1, 2].map((index) => (
      <div
        key={index}
        aria-hidden="true"
        className={css({
          height: '2.25rem',
          borderRadius: 8,
          backgroundColor: 'greyscale.100',
          animation: 'pulse_background 1.5s ease-in-out infinite',
        })}
      />
    ))}
  </div>
)

const SectionMessage = ({ children }: { children?: ReactNode }) => (
  <Text as="p" variant="smNote" margin={false} wrap="pretty">
    {children}
  </Text>
)

const SectionError = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation('home', { keyPrefix: 'panel' })
  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.25rem',
      })}
    >
      <SectionMessage>{t('error')}</SectionMessage>
      <Button variant="tertiaryText" size="sm" onPress={onRetry}>
        {t('retry')}
      </Button>
    </div>
  )
}

const RoomRow = ({ room }: { room: ApiRoom }) => {
  const { t } = useTranslation('home', { keyPrefix: 'panel.rooms' })
  const { isRoomUrlCopied, copyRoomUrlToClipboard } =
    useCopyRoomToClipboard(room)
  const { mutate: rename, isPending } = useRenameRoom()

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(room.name || room.slug)

  const name = room.name || room.slug
  const copyLabel = isRoomUrlCopied ? t('copied') : t('copy', { name })

  const submit = () => {
    const next = draft.trim()
    if (next && next !== name) {
      rename({ slug: room.slug, name: next })
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <li className={rowStyle}>
        <form
          className={editRowStyle}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Input
            aria-label={t('rename')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            maxLength={255}
          />
          <Button
            variant="tertiaryText"
            square
            size="sm"
            onPress={submit}
            isDisabled={isPending || draft.trim() === ''}
            aria-label={t('renameSave')}
          >
            <RiCheckLine size={18} aria-hidden="true" />
          </Button>
          <Button
            variant="tertiaryText"
            square
            size="sm"
            onPress={() => {
              setDraft(name)
              setIsEditing(false)
            }}
            aria-label={t('renameCancel')}
          >
            <RiCloseLine size={18} aria-hidden="true" />
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className={rowStyle}>
      <WouterLink
        to={String(getRoutePath('room', room.slug))}
        className={rowLinkStyle}
      >
        <RiVideoChatLine
          size={18}
          aria-hidden="true"
          className={rowIconStyle}
        />
        <span className={rowTitleStyle}>{name}</span>
      </WouterLink>
      <Button
        variant="tertiaryText"
        square
        size="sm"
        onPress={() => {
          setDraft(name)
          setIsEditing(true)
        }}
        aria-label={t('rename')}
        tooltip={t('rename')}
      >
        <RiPencilLine size={18} aria-hidden="true" />
      </Button>
      <Button
        variant={isRoomUrlCopied ? 'success' : 'tertiaryText'}
        square
        size="sm"
        onPress={copyRoomUrlToClipboard}
        aria-label={copyLabel}
        tooltip={copyLabel}
      >
        {isRoomUrlCopied ? (
          <RiCheckLine size={18} aria-hidden="true" />
        ) : (
          <RiFileCopyLine size={18} aria-hidden="true" />
        )}
      </Button>
    </li>
  )
}

const RoomsSection = () => {
  const { t } = useTranslation('home', { keyPrefix: 'panel' })
  const { data, isLoading, isError, refetch } = useListMyRooms({
    pageSize: MAX_ITEMS,
  })

  const rooms = data?.results?.slice(0, MAX_ITEMS) ?? []

  return (
    <Section
      title={t('rooms.title')}
      icon={<RiVideoChatLine size={16} aria-hidden="true" />}
    >
      {isLoading ? (
        <SectionLoading label={t('loading')} />
      ) : isError ? (
        <SectionError onRetry={() => refetch()} />
      ) : rooms.length === 0 ? (
        <SectionMessage>{t('rooms.empty')}</SectionMessage>
      ) : (
        <ul className={listStyle}>
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} />
          ))}
        </ul>
      )}
    </Section>
  )
}

/**
 * Signed-in launchpad panel: the user's rooms, by name.
 */
export const HomePanel = () => (
  <Panel>
    <RoomsSection />
  </Panel>
)
