import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Button, Input, Text } from '@/primitives'
import { fetchApi } from '@/api/fetchApi'
import type { RecordingAccessApi } from '../api/fetchRecording'

type RecordingShareProps = {
  recordingId: string
  accesses: RecordingAccessApi[]
}

export const RecordingShare = ({
  recordingId,
  accesses,
}: RecordingShareProps) => {
  const { t } = useTranslation('recording', { keyPrefix: 'share' })
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['recording', recordingId] })

  const addAccess = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      await fetchApi(`/recordings/${recordingId}/accesses/`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setEmail('')
      await refresh()
    } catch {
      setError(t('error.invite'))
    } finally {
      setIsPending(false)
    }
  }

  const removeAccess = async (accessId: string) => {
    setError(null)
    try {
      await fetchApi(
        `/recordings/${recordingId}/accesses/?access_id=${accessId}`,
        { method: 'DELETE' }
      )
      await refresh()
    } catch {
      setError(t('error.remove'))
    }
  }

  return (
    <div
      className={css({
        backgroundColor: 'greyscale.50',
        borderRadius: '5px',
        padding: '1rem',
        maxWidth: '80%',
        marginTop: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      })}
    >
      <Text>{t('description')}</Text>
      <form
        onSubmit={addAccess}
        className={css({ display: 'flex', gap: '0.5rem' })}
      >
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('emailPlaceholder')}
          aria-label={t('emailPlaceholder')}
          required
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={isPending}
          isDisabled={isPending}
        >
          {t('add')}
        </Button>
      </form>
      {error && <Text variant="smNote">{error}</Text>}
      {accesses.length > 0 && (
        <ul className={css({ display: 'flex', flexDirection: 'column' })}>
          {accesses.map((access) => (
            <li
              key={access.id}
              className={css({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingY: '0.25rem',
              })}
            >
              <Text>{access.user.email ?? access.user.full_name}</Text>
              <Button
                variant="tertiaryText"
                size="xs"
                onPress={() => removeAccess(access.id)}
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
