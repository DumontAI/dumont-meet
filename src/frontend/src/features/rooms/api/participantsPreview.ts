import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { keys } from '@/api/queryKeys'

export type ApiParticipantsPreview = {
  count: number
  participants: { name: string | null; color: string | null }[]
  // False when LiveKit could not be reached: the list is unknown, not empty.
  available: boolean
}

/**
 * Who is already in the call, polled while the user sits on the pre-join
 * screen. The backend answers 403 to anyone who would wait in the lobby, so
 * polling stops on the first error.
 */
export const useParticipantsPreview = (roomId: string) =>
  useQuery({
    queryKey: [keys.participantsPreview, roomId],
    queryFn: () =>
      fetchApi<ApiParticipantsPreview>(
        `/rooms/${roomId}/participants-preview/`
      ),
    retry: false,
    refetchInterval: (query) => (query.state.error ? false : 10_000),
  })
