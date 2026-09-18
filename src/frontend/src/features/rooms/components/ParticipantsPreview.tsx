import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { Avatar } from '@/components/Avatar'
import { useParticipantsPreview } from '../api/participantsPreview'
import { DEFAULT_COLOR, isValidHsl } from '../utils/getParticipantColor'

const MAX_AVATARS = 3

/** "Carlos Ferri and 2 others are in this call", shown before joining. */
export const ParticipantsPreview = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join.presence' })
  const { data } = useParticipantsPreview(roomId)

  // Nothing while loading, when refused (lobby) or when LiveKit is unreachable.
  if (!data?.available) return null

  const [first] = data.participants
  const firstName = first?.name || t('someone')
  const message =
    data.count === 0
      ? t('empty')
      : data.count === 1
        ? t('one', { name: firstName })
        : t('many', { name: firstName, count: data.count - 1 })

  return (
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
      })}
      aria-live="polite"
    >
      {data.count > 0 && (
        <div className={css({ display: 'flex', flexShrink: 0 })}>
          {data.participants.slice(0, MAX_AVATARS).map((p, i) => (
            <Avatar
              key={i}
              name={p.name ?? undefined}
              bgColor={p.color && isValidHsl(p.color) ? p.color : DEFAULT_COLOR}
              style={{ marginLeft: i ? '-0.25rem' : 0 }}
              notification
            />
          ))}
        </div>
      )}
      <Text as="p" variant="note" margin={false}>
        {message}
      </Text>
    </div>
  )
}
