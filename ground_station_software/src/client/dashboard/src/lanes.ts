import type { PacketField, Slot, UserSlot } from './contract'

// Lane contents provisional [confirm with team]
// Typed as PacketField so a field rename in contract.ts is a compile error here.

export const RESERVED_CHART_FIELDS: PacketField[] = ['altitude', 'velocity']

export const RESERVED_READOUT_FIELDS: PacketField[] = ['latitude', 'longitude']

export const USER_SLOTS: UserSlot[] = ['user1', 'user2']

export const SLOT_LABELS: Record<Slot, string> = {
  reserved: 'Reserved',
  user1: 'User 1',
  user2: 'User 2',
}

// Compact labels for dense views (module headers, status strip).
export const SLOT_SHORT: Record<Slot, string> = {
  reserved: 'RSV',
  user1: 'U1',
  user2: 'U2',
}
