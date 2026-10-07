import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/**
 * Rename a room. Names defaulted to the random slug at creation; this lets the
 * owner give a meeting a title that reads on the home instead of a code.
 */
export const renameRoom = ({ slug, name }: { slug: string; name: string }) =>
  fetchApi<ApiRoom>(`rooms/${slug}/`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })

export const useRenameRoom = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: renameRoom,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [keys.rooms] }),
  })
}
