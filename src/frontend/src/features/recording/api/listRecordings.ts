import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { keys } from '@/api/queryKeys'
import { useUser } from '@/features/auth/api/useUser'
import { type RecordingApi } from './fetchRecording'

type ListRecordingsResponse = {
  count: number
  next: string | null
  previous: string | null
  results: RecordingApi[]
}

/**
 * Recordings the current user has access to, most recent first.
 */
export const listMyRecordings = ({ pageSize }: { pageSize: number }) => {
  const query = new URLSearchParams({ page_size: pageSize.toString() })
  return fetchApi<ListRecordingsResponse>(`/recordings/?${query.toString()}`, {
    method: 'GET',
  })
}

export const useListMyRecordings = (
  params: Parameters<typeof listMyRecordings>[0]
) => {
  const { isLoggedIn } = useUser()
  return useQuery({
    queryKey: [keys.recordings, params],
    queryFn: () => listMyRecordings(params),
    retry: false,
    enabled: isLoggedIn === true,
  })
}
