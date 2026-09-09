import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { keys } from '@/api/queryKeys'
import { useUser } from '@/features/auth/api/useUser'
import { type ApiRoom } from './ApiRoom'

type ListRoomsResponse = {
  count: number
  next: string | null
  previous: string | null
  results: ApiRoom[]
}

/**
 * Rooms the current user administrates or owns.
 * The backend paginates and orders them by name.
 */
export const listMyRooms = ({ pageSize }: { pageSize: number }) => {
  const query = new URLSearchParams({ page_size: pageSize.toString() })
  return fetchApi<ListRoomsResponse>(`/rooms/?${query.toString()}`, {
    method: 'GET',
  })
}

export const useListMyRooms = (params: Parameters<typeof listMyRooms>[0]) => {
  const { isLoggedIn } = useUser()
  return useQuery({
    queryKey: [keys.rooms, params],
    queryFn: () => listMyRooms(params),
    retry: false,
    enabled: isLoggedIn === true,
  })
}
