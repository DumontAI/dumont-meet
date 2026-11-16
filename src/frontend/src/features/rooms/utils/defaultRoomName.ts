export const defaultRoomName = (date: Date = new Date()) => {
  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
  return `Meeting ${formatted}`
}
